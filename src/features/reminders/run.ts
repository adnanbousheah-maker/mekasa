import "server-only";
import { formatScheduleTime } from "@/features/settings/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDate } from "@/lib/time";
import { pendingAlerts } from "./slots";
import { sendPushToStaff } from "./push";
import { countReminderMessage } from "./subscription";

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

  const [settings, schedules, counts, sent] = await Promise.all([
    db.from("app_settings").select("count_reminder_minutes_before, count_late_after_minutes").single(),
    db
      .from("count_schedules")
      .select("id, location_id, time_of_day, location:locations!inner(name, kind, is_active)")
      .eq("is_active", true)
      .eq("location.is_active", true),
    db.from("stock_counts").select("schedule_id").eq("business_date", today).eq("status", "confirmed"),
    db.from("notification_log").select("kind, schedule_id").eq("slot_date", today),
  ]);
  for (const r of [settings, schedules, counts, sent]) if (r.error) throw new Error(r.error.message);

  const alerts = pendingAlerts(
    schedules.data!.map((s) => ({ id: s.id, locationId: s.location_id, timeOfDay: s.time_of_day })),
    today,
    now,
    new Set(counts.data!.map((c) => c.schedule_id).filter((id): id is string => id !== null)),
    new Set(sent.data!.map((n) => `${n.kind}:${n.schedule_id}`)),
    {
      reminderMinutesBefore: settings.data!.count_reminder_minutes_before,
      lateAfterMinutes: settings.data!.count_late_after_minutes,
    },
  );

  const result: ReminderRun = { sent: [] };
  for (const alert of alerts) {
    // نحجز الإشعار أول: إذا انحجز قبل (cron ثاني)، ما بنبعت
    const { data: logged, error } = await db
      .from("notification_log")
      .insert({
        kind: alert.kind,
        location_id: alert.schedule.locationId,
        schedule_id: alert.schedule.id,
        slot_date: today,
      })
      .select("id")
      .maybeSingle();
    if (error || !logged) continue;

    const schedule = schedules.data!.find((s) => s.id === alert.schedule.id)!;
    const role = schedule.location.kind === "factory" ? "storekeeper" : "branch_staff";
    const { data: staff } = await db
      .from("staff")
      .select("id, staff_roles!staff_roles_staff_id_fkey!inner(role)")
      .eq("is_active", true)
      .eq("location_id", alert.schedule.locationId)
      .eq("staff_roles.role", role);
    const ids = (staff ?? []).map((s) => s.id);
    if (alert.kind === "count_late") {
      const { data: admins } = await db
        .from("staff")
        .select("id, staff_roles!staff_roles_staff_id_fkey!inner(role)")
        .eq("is_active", true)
        .eq("staff_roles.role", "admin");
      ids.push(...(admins ?? []).map((a) => a.id));
    }

    const place =
      schedule.location.kind === "branch" ? `فرع ${schedule.location.name}` : schedule.location.name;
    const message = countReminderMessage(alert.kind, formatScheduleTime(alert.schedule.timeOfDay), place);
    const recipients = await sendPushToStaff([...new Set(ids)], message);
    await db.from("notification_log").update({ recipients }).eq("id", logged.id);
    result.sent.push({ kind: alert.kind, scheduleId: alert.schedule.id, recipients });
  }
  await alertUnreceivedDispatches(db, result);
  await alertBelowMin(db, today, result);
  await alertForgottenItems(db, now, result);
  return result;
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
 * أصناف تحت الحد الأدنى بالفروع: إشعار وحد لكل فرع (فيه الأصناف الجديدة) لموظفين الفرع وللأدمن.
 * كل صنف بينبعت مرة باليوم بس (notification_log).
 */
async function alertBelowMin(db: ReturnType<typeof createAdminClient>, today: string, result: ReminderRun) {
  const { data: below, error } = await db
    .from("v_below_min")
    .select("location_id, product_id, location:locations!inner(name), product:products!inner(name_en)");
  if (error) throw new Error(error.message);

  const fresh = new Map<string, { name: string; products: string[] }>();
  for (const row of below ?? []) {
    const { data: logged } = await db
      .from("notification_log")
      .insert({
        kind: "below_min",
        location_id: row.location_id,
        product_id: row.product_id,
        slot_date: today,
      })
      .select("id")
      .maybeSingle();
    if (!logged) continue;
    const entry = fresh.get(row.location_id!) ?? { name: row.location.name, products: [] };
    entry.products.push(row.product.name_en);
    fresh.set(row.location_id!, entry);
  }
  if (fresh.size === 0) return;

  const admins = await activeAdmins(db);
  for (const [locationId, { name, products }] of fresh) {
    const { data: staff } = await db
      .from("staff")
      .select("id")
      .eq("is_active", true)
      .eq("location_id", locationId);
    const recipients = await sendPushToStaff([...new Set([...(staff ?? []).map((s) => s.id), ...admins])], {
      title: "تحت الحد الأدنى",
      body: `فرع ${name}: ${products.join("، ")} ${products.length === 1 ? "قلّ" : "قلّوا"} عن الحد الأدنى.`,
      url: "/",
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

  let admins: string[] | null = null;
  for (const r of requests) {
    const { data: logged } = await db
      .from("notification_log")
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
  for (const d of overdue ?? []) {
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
    const recipients = await sendPushToStaff(
      [...new Set([...(staff ?? []), ...(admins ?? [])].map((s) => s.id))],
      {
        title: "إخراج ما انستلم",
        body: `في إخراج لـ${loc?.name ?? ""} بالطريق من ${Math.floor(Number(d.hours_in_transit ?? 0))} ساعة. استلمه أو بلّغ عن مشكلة.`,
        url: "/orders",
        tag: `dispatch-${d.id}`,
      },
    );
    await db.from("notification_log").update({ recipients }).eq("id", logged.id);
    result.sent.push({ kind: "dispatch_unreceived", scheduleId: d.id!, recipients });
  }
}
