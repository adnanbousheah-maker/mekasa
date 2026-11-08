import "server-only";
import { formatScheduleTime } from "@/features/settings/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDate, countDay, isLastDayOfMonth } from "@/lib/time";
import { pendingAlerts, slotStatus, slotTime, type PendingAlert, type ReminderSettings } from "./slots";
import { sendPushToStaff } from "./push";
import { countReminderMessage, monthlyCountMessage } from "./subscription";

export interface ReminderRun {
  sent: { kind: string; scheduleId: string; recipients: number }[];
}

/**
 * بيشتغل كل دقيقة (pg_cron ← /api/cron/reminders). تذكير قبل الموعد لموظفين الموقع،
 * و"متأخر" لموظفين الموقع وللأدمن. notification_log فريد، فإذا اشتغل مرتين بنفس الوقت
 * الثاني ما بيبعت شي.
 */
export async function runReminders(now = new Date()): Promise<ReminderRun> {
  const db = createAdminClient();
  const today = businessDate(now);
  // الجرد ومواعيده على يوم الجرد (بيخلص 5 الصبح)
  const countToday = countDay(now);

  const [settings, schedules, counts, sent] = await Promise.all([
    db.from("app_settings").select("count_reminder_minutes_before, count_late_after_minutes").single(),
    db
      .from("count_schedules")
      .select("id, location_id, time_of_day, location:locations!inner(name, kind, is_active)")
      .eq("is_active", true)
      .eq("location.is_active", true),
    db.from("stock_counts").select("schedule_id").eq("business_date", countToday).eq("status", "confirmed"),
    db.from("notification_log").select("kind, schedule_id").eq("slot_date", countToday),
  ]);
  for (const r of [settings, schedules, counts, sent]) if (r.error) throw new Error(r.error.message);

  const reminderSettings: ReminderSettings = {
    reminderMinutesBefore: settings.data!.count_reminder_minutes_before,
    lateAfterMinutes: settings.data!.count_late_after_minutes,
  };
  const alerts = pendingAlerts(
    schedules.data!.map((s) => ({ id: s.id, locationId: s.location_id, timeOfDay: s.time_of_day })),
    countToday,
    now,
    new Set(counts.data!.map((c) => c.schedule_id).filter((id): id is string => id !== null)),
    new Set(sent.data!.map((n) => `${n.kind}:${n.schedule_id}`)),
    reminderSettings,
  );

  const result: ReminderRun = { sent: [] };
  for (const alert of alerts) {
    try {
      await sendCountAlert(db, alert, schedules.data!, countToday, result);
    } catch (error) {
      // موعد واحد فشل: الباقي بيكمل
      console.error("reminders: count", error);
    }
  }
  // كل نوع تنبيه لحاله: إذا واحد فشل، الباقي بيكمل
  for (const [name, run] of [
    ["unreceived", () => alertUnreceivedDispatches(db, result)],
    ["below_min", () => alertBelowMin(db, today, result)],
    ["missing_items", () => alertForgottenItems(db, now, result)],
    ["monthly", () => alertMonthlyCounts(db, now, countToday, reminderSettings, result)],
  ] as const) {
    try {
      await run();
    } catch (error) {
      console.error(`reminders: ${name}`, error);
    }
  }
  return result;
}

type Db = ReturnType<typeof createAdminClient>;

type ScheduleRow = {
  id: string;
  location_id: string;
  time_of_day: string;
  location: { name: string; kind: string; is_active: boolean };
};

/** تذكير أو "متأخر" لموعد جرد واحد: للموظفين، والمتأخر للأدمن كمان (على لوحته). */
async function sendCountAlert(
  db: Db,
  alert: PendingAlert,
  schedules: ScheduleRow[],
  countToday: string,
  result: ReminderRun,
) {
  // نحجز الإشعار أول: إذا انحجز قبل (cron ثاني)، ما بنبعت
  const { data: logged, error } = await db
    .from("notification_log")
    .insert({
      kind: alert.kind,
      location_id: alert.schedule.locationId,
      schedule_id: alert.schedule.id,
      slot_date: countToday,
    })
    .select("id")
    .maybeSingle();
  if (error || !logged) return;

  const schedule = schedules.find((s) => s.id === alert.schedule.id)!;
  const role = schedule.location.kind === "factory" ? "storekeeper" : "branch_staff";
  const { data: staff, error: staffError } = await db
    .from("staff")
    .select("id, staff_roles!staff_roles_staff_id_fkey!inner(role)")
    .eq("is_active", true)
    .eq("location_id", alert.schedule.locationId)
    // مسؤول الفرع بيوصله نفس تنبيهات موظفين فرعه
    .in("staff_roles.role", role === "branch_staff" ? ["branch_staff", "branch_manager"] : [role]);
  if (staffError) throw new Error(staffError.message);
  const admins = alert.kind === "count_late" ? await activeAdmins(db) : [];
  const adminIds = new Set(admins);

  const place =
    schedule.location.kind === "branch" ? `فرع ${schedule.location.name}` : schedule.location.name;
  const message = countReminderMessage(alert.kind, formatScheduleTime(alert.schedule.timeOfDay), place);
  const recipients =
    (await sendPushToStaff(
      [...new Set((staff ?? []).map((s) => s.id))].filter((id) => !adminIds.has(id)),
      message,
    )) + (admins.length ? await sendPushToStaff([...adminIds], { ...message, url: "/admin" }) : 0);
  await db.from("notification_log").update({ recipients }).eq("id", logged.id);
  result.sent.push({ kind: alert.kind, scheduleId: alert.schedule.id, recipients });
}

/**
 * جرد آخر الشهر (بآخر يوم بالشهر بس): تذكير قبل الموعد لموظفين الموقع، و"متأخر" لإلهم وللأدمن.
 * كل موقع ونوع جرد بينبعتله مرة بس (alert_log).
 */
async function alertMonthlyCounts(
  db: Db,
  now: Date,
  countToday: string,
  settings: ReminderSettings,
  result: ReminderRun,
) {
  if (!isLastDayOfMonth(countToday)) return;
  const { data: monthly, error } = await db
    .from("monthly_counts")
    .select("id, location_id, scope, time_of_day, location:locations!inner(name, kind, is_active)")
    .eq("is_active", true)
    .eq("location.is_active", true);
  if (error) throw new Error(error.message);
  if (!monthly?.length) return;

  const { data: sent, error: sentError } = await db
    .from("alert_log")
    .select("kind, location_id")
    .in("kind", ["monthly_count_reminder", "monthly_count_late", "monthly_raw_reminder", "monthly_raw_late"])
    .eq("slot_date", countToday);
  if (sentError) throw new Error(sentError.message);
  const already = new Set((sent ?? []).map((a) => `${a.kind}:${a.location_id}`));

  let admins: string[] | null = null;
  for (const m of monthly) {
    const scope = m.scope === "raw" ? "raw" : "stock";
    const slotAt = slotTime(countToday, m.time_of_day);
    if (slotStatus(slotAt, now, false, settings) === "upcoming") continue;
    // نفس الفحص اللي بالـ view: جرد قريب من الموعد، وكل المواد الأولية
    const { data: done, error: doneError } = await db.rpc("monthly_count_done", {
      p_location_id: m.location_id,
      p_scope: scope,
      p_day: countToday,
      p_slot_at: slotAt.toISOString(),
    });
    if (doneError) throw new Error(doneError.message);
    const status = slotStatus(slotAt, now, done === true, settings);
    if (status !== "due" && status !== "late") continue;
    // بعد ساعتين من التأخير ما بنبعت شي جديد (متل مواعيد كل يوم)
    if (now.getTime() - slotAt.getTime() > 2 * 3_600_000 + settings.lateAfterMinutes * 60_000) continue;
    const late = status === "late";
    const kind = `monthly_${scope === "raw" ? "raw" : "count"}_${late ? "late" : "reminder"}` as const;
    if (already.has(`${kind}:${m.location_id}`)) continue;

    const { data: logged } = await db
      .from("alert_log")
      .insert({ kind, location_id: m.location_id, slot_date: countToday })
      .select("id")
      .maybeSingle();
    if (!logged) continue;

    const role =
      scope === "raw" || m.location.kind === "factory"
        ? "storekeeper"
        : m.location.kind === "packaging"
          ? "packaging_keeper"
          : "branch_staff";
    let query = db
      .from("staff")
      .select("id, staff_roles!staff_roles_staff_id_fkey!inner(role)")
      .eq("is_active", true)
      // مسؤول الفرع بيوصله نفس تنبيهات موظفين فرعه
      .in("staff_roles.role", role === "branch_staff" ? ["branch_staff", "branch_manager"] : [role]);
    // أمين التغليف وين ما كان، والباقي بموقعه
    if (role !== "packaging_keeper") query = query.eq("location_id", m.location_id);
    const { data: staff } = await query;
    const ids = (staff ?? []).map((s) => s.id);
    if (late) ids.push(...(admins ??= await activeAdmins(db)));

    const place = m.location.kind === "branch" ? `فرع ${m.location.name}` : m.location.name;
    const recipients = await sendPushToStaff(
      [...new Set(ids)],
      monthlyCountMessage(
        late,
        scope,
        formatScheduleTime(m.time_of_day),
        place,
        m.location.kind,
        m.location_id,
      ),
    );
    result.sent.push({ kind, scheduleId: m.id, recipients });
  }
}

async function activeAdmins(db: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data } = await db
    .from("staff")
    .select("id, staff_roles!staff_roles_staff_id_fkey!inner(role)")
    .eq("is_active", true)
    .eq("staff_roles.role", "admin");
  return (data ?? []).map((a) => a.id);
}

/**
 * أصناف تحت الحد الأدنى (فروع، مصنع، مستودع تغليف): إشعار وحد لكل موقع (فيه الأصناف الجديدة)
 * لموظفين الموقع (وأمناء التغليف للمستودع) وللأدمن.
 * كل صنف بينبعت مرة باليوم بس (alert_log).
 */
async function alertBelowMin(db: ReturnType<typeof createAdminClient>, today: string, result: ReminderRun) {
  const { data: below, error } = await db
    .from("v_below_min")
    .select("location_id, product_id, location:locations!inner(name, kind), product:products!inner(name_en)");
  if (error) throw new Error(error.message);

  // اللي انبعت اليوم ما بنحاول نسجله كمان مرة (كان بيفشل كل دقيقة على القيد)
  const { data: sent } = await db
    .from("alert_log")
    .select("location_id, product_id")
    .eq("kind", "below_min")
    .eq("slot_date", today);
  const already = new Set((sent ?? []).map((a) => `${a.location_id}:${a.product_id}`));

  const fresh = new Map<string, { name: string; kind: string; products: string[] }>();
  for (const row of below ?? []) {
    if (already.has(`${row.location_id}:${row.product_id}`)) continue;
    const { data: logged } = await db
      .from("alert_log")
      .insert({
        kind: "below_min",
        location_id: row.location_id,
        product_id: row.product_id,
        slot_date: today,
      })
      .select("id")
      .maybeSingle();
    if (!logged) continue;
    const entry = fresh.get(row.location_id!) ?? {
      name: row.location.name,
      kind: row.location.kind,
      products: [],
    };
    entry.products.push(row.product.name_en);
    fresh.set(row.location_id!, entry);
  }
  if (fresh.size === 0) return;

  const admins = await activeAdmins(db);
  for (const [locationId, { name, kind, products }] of fresh) {
    // مستودع التغليف: أمناء التغليف وين ما كانوا، والباقي: موظفين الموقع
    const { data: staff } =
      kind === "packaging"
        ? await db
            .from("staff")
            .select("id, staff_roles!staff_roles_staff_id_fkey!inner(role)")
            .eq("is_active", true)
            .eq("staff_roles.role", "packaging_keeper")
        : await db.from("staff").select("id").eq("is_active", true).eq("location_id", locationId);
    const recipients = await sendPushToStaff([...new Set([...(staff ?? []).map((s) => s.id), ...admins])], {
      title: "تحت الحد الأدنى",
      body: `${kind === "branch" ? `فرع ${name}` : name}: ${products.join("، ")} ${products.length === 1 ? "قلّ" : "قلّوا"} عن الحد الأدنى.`,
      // الفرع بيطلب من شاشة الطلب، والمصنع بيشوفهم برئيسيته
      url: kind === "packaging" ? "/packaging" : kind === "branch" ? "/order" : "/",
      tag: `below-min-${locationId}-${today}`,
    });
    result.sent.push({ kind: "below_min", scheduleId: locationId, recipients });
  }
}

/** طلب انبعت وفيه أصناف مقترحة ما انطلبت: إشعار للأدمن، مرة لكل طلب. */
async function alertForgottenItems(db: ReturnType<typeof createAdminClient>, now: Date, result: ReminderRun) {
  const { data: requests, error } = await db
    .from("stock_requests")
    .select(
      "id, requesting_location_id, requesting:locations!stock_requests_requesting_location_id_fkey(name), stock_request_missing!inner(product:products!inner(name_en))",
    )
    .gte("requested_at", new Date(now.getTime() - 86_400_000).toISOString())
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  if (!requests?.length) return;

  const { data: sent } = await db
    .from("alert_log")
    .select("request_id")
    .eq("kind", "order_missing_item")
    .in(
      "request_id",
      requests.map((r) => r.id),
    );
  const already = new Set((sent ?? []).map((a) => a.request_id));

  let admins: string[] | null = null;
  for (const r of requests) {
    if (already.has(r.id)) continue;
    const { data: logged } = await db
      .from("alert_log")
      .insert({ kind: "order_missing_item", location_id: r.requesting_location_id, request_id: r.id })
      .select("id")
      .maybeSingle();
    if (!logged) continue;
    admins ??= await activeAdmins(db);
    const names = r.stock_request_missing.map((m) => m.product.name_en);
    const recipients = await sendPushToStaff(admins, {
      title: "صنف ما انطلب",
      body: `فرع ${r.requesting.name} بعت طلب بدون: ${names.join("، ")}.`,
      url: `/admin/orders?id=${r.id}`,
      tag: `missing-${r.id}`,
    });
    result.sent.push({ kind: "order_missing_item", scheduleId: r.id, recipients });
  }
}

/** إخراج ما انستلم بعد عدد الساعات المحدد: إشعار لموظفين الوجهة وللأدمن، مرة وحدة. */
async function alertUnreceivedDispatches(db: ReturnType<typeof createAdminClient>, result: ReminderRun) {
  const { data: overdue, error } = await db
    .from("v_unreceived_dispatches")
    .select("id, to_location_id, hours_in_transit")
    .eq("is_overdue", true);
  if (error) throw new Error(error.message);
  if (!overdue?.length) return;
  // اللي انبعت قبل ما بنرجع نسجله (كان بيفشل كل دقيقة على القيد)
  const { data: sentBefore, error: sentError } = await db
    .from("notification_log")
    .select("dispatch_id")
    .eq("kind", "dispatch_unreceived")
    .in(
      "dispatch_id",
      overdue.map((d) => d.id!),
    );
  if (sentError) throw new Error(sentError.message);
  const already = new Set((sentBefore ?? []).map((n) => n.dispatch_id));
  for (const d of overdue) {
    if (already.has(d.id)) continue;
    const { data: logged } = await db
      .from("notification_log")
      .insert({ kind: "dispatch_unreceived", location_id: d.to_location_id, dispatch_id: d.id })
      .select("id")
      .maybeSingle();
    if (!logged) continue;
    const [{ data: staff }, { data: admins }, { data: loc }] = await Promise.all([
      db.from("staff").select("id").eq("is_active", true).eq("location_id", d.to_location_id!),
      db
        .from("staff")
        .select("id, staff_roles!staff_roles_staff_id_fkey!inner(role)")
        .eq("is_active", true)
        .eq("staff_roles.role", "admin"),
      db.from("locations").select("name").eq("id", d.to_location_id!).single(),
    ]);
    const message = {
      title: "إخراج ما انستلم",
      body: `في إخراج لـ${loc?.name ?? ""} بالطريق من ${Math.floor(Number(d.hours_in_transit ?? 0))} ساعة. استلمه أو بلّغ عن مشكلة.`,
      tag: `dispatch-${d.id}`,
    };
    const adminIds = new Set((admins ?? []).map((a) => a.id));
    // الفرع بيفتح استلاماته، والأدمن الطلب بلوحته
    const recipients =
      (await sendPushToStaff(
        (staff ?? []).map((s) => s.id).filter((id) => !adminIds.has(id)),
        { ...message, url: "/orders" },
      )) +
      (await sendPushToStaff([...adminIds], { ...message, url: `/admin/orders?filter=road&id=${d.id}` }));
    await db.from("notification_log").update({ recipients }).eq("id", logged.id);
    result.sent.push({ kind: "dispatch_unreceived", scheduleId: d.id!, recipients });
  }
}
