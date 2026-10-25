import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../../src/types/database";

// موظفين scripts/seed-staff.ts (لازم `npm run db:seed-staff` قبل الاختبارات)
export const ADMIN = { phone: "0790000001", pin: "2468", name: "عدنان" };
export const BRANCH = { phone: "0790000002", pin: "2580", name: "أحمد", e164: "962790000002" };
export const BRANCH_JBH = { phone: "0790000003", pin: "1470", name: "رنا" };
export const BRANCH_DBQ = { phone: "0790000004", pin: "3690", name: "خالد" };
export const FACTORY = { phone: "0790000005", pin: "1593", name: "سامر" };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env is missing (.env.local)");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url))
    throw new Error("E2E tests run against local Supabase only");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signIn(page: Page, phone: string, pin: string) {
  await page.goto("/login");
  await page.getByLabel("رقم الجوال").fill(phone);
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "دخول" }).click();
}

/** بيستنى لحد ما الدخول يخلص (الرئيسية أو لوحة الأدمن). */
export async function signInAndWait(page: Page, phone: string, pin: string) {
  await signIn(page, phone, pin);
  await page.waitForURL((url) => url.pathname !== "/login");
}

/** مجموع الستوك لصنف بموقع (بالقطع)، من الدفتر مباشرة. */
export async function stockOf(locationCode: string, productName: string): Promise<number> {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", locationCode).single();
  const { data: product } = await db.from("products").select("id").eq("name_en", productName).single();
  const { data, error } = await db
    .from("stock_movements")
    .select("qty_pieces")
    .eq("location_id", loc!.id)
    .eq("product_id", product!.id);
  if (error) throw error;
  return data.reduce((s, m) => s + m.qty_pieces, 0);
}

/** آخر تالف انسجل بموقع. */
export async function lastWaste(locationCode: string) {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", locationCode).single();
  const { data, error } = await db
    .from("waste_records")
    .select("qty_pieces, reason, reason_note, photo_path, products(name_en)")
    .eq("location_id", loc!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

/** آخر جرد مؤكد بموقع، مع أسطره. */
export async function lastCount(locationCode: string) {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", locationCode).single();
  const { data, error } = await db
    .from("stock_counts")
    .select(
      "method, photo_path, form_version_id, stock_count_lines(whole_cakes, loose_pieces, ocr_whole_cakes, ocr_whole_confidence, products(name_en))",
    )
    .eq("location_id", loc!.id)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

/** موعد جرد مؤقت بموقع، بيرجع id ودالة تشيله (مع سجل إشعاراته). */
export async function temporarySchedule(locationCode: string, timeOfDay: string) {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", locationCode).single();
  const { data, error } = await db
    .from("count_schedules")
    .upsert(
      { location_id: loc!.id, time_of_day: timeOfDay, is_active: true },
      { onConflict: "location_id,time_of_day" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    async remove() {
      await db.from("notification_log").delete().eq("schedule_id", data.id);
      await db.from("count_schedules").delete().eq("id", data.id);
    },
  };
}

/** الحد المطلوب بفرع: كل الأصناف صفر إلا اللي بالخريطة (بالقطع). بيرجع دالة بترجّع القيم القديمة. */
export async function setParLevels(locationCode: string, pieces: Record<string, number>) {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", locationCode).single();
  const { data: before } = await db
    .from("par_levels")
    .select("product_id, par_pieces")
    .eq("location_id", loc!.id);
  const { data: products } = await db.from("products").select("id, name_en");
  const rows = (products ?? []).map((p) => ({
    location_id: loc!.id,
    product_id: p.id,
    par_pieces: pieces[p.name_en] ?? 0,
  }));
  const { error } = await db.from("par_levels").upsert(rows, { onConflict: "location_id,product_id" });
  if (error) throw error;
  return async () => {
    await db.from("par_levels").upsert(
      (before ?? []).map((b) => ({
        location_id: loc!.id,
        product_id: b.product_id,
        par_pieces: b.par_pieces,
      })),
      { onConflict: "location_id,product_id" },
    );
  };
}

/** ستوك دفعة اليوم بالمصنع لصنف. */
export async function factoryTodayStock(productName: string): Promise<number> {
  const db = serviceClient();
  const { data: fac } = await db.from("locations").select("id").eq("code", "FAC").single();
  const { data: product } = await db.from("products").select("id").eq("name_en", productName).single();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(new Date());
  const { data: batch } = await db
    .from("batches")
    .select("id")
    .eq("product_id", product!.id)
    .eq("production_date", today)
    .maybeSingle();
  if (!batch) return 0;
  const { data } = await db
    .from("stock_movements")
    .select("qty_pieces")
    .eq("location_id", fac!.id)
    .eq("batch_id", batch.id);
  return (data ?? []).reduce((s, m) => s + m.qty_pieces, 0);
}

// صورة PNG صغيرة (1×1) للاختبارات
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export async function expectOnLogin(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "أهلاً فيك" })).toBeVisible();
}

/** بيرجع حساب الموظف التجريبي لحالته بعد اختبار الرمز الغلط. */
export async function clearLock(e164: string) {
  const { error } = await serviceClient()
    .from("staff")
    .update({ failed_pin_attempts: 0, locked_until: null, requires_admin_reset: false })
    .eq("phone", e164);
  if (error) throw error;
}

/** بيحذف موظف أنشأه اختبار (الصف وحساب الدخول). */
export async function removeStaff(e164: string) {
  const db = serviceClient();
  const { data } = await db.from("staff").select("id").eq("phone", e164).maybeSingle();
  if (!data) return;
  await db.from("staff_roles").delete().eq("staff_id", data.id);
  await db.from("staff").delete().eq("id", data.id);
  await db.auth.admin.deleteUser(data.id);
}

/** بيرجع الإعدادات والأصناف والمواعيد اللي غيرها اختبار الإعدادات لقيم الـ seed. */
export async function restoreSettings({
  productName,
  scheduleTime,
}: {
  productName: string;
  scheduleTime: string;
}) {
  const db = serviceClient();
  const results = await Promise.all([
    db.from("app_settings").update({ unreceived_alert_hours: 3, returns_enabled: false }).eq("id", true),
    db.from("products").update({ name_ar: null, pieces_per_cake: null }).eq("name_en", "Flan"),
    db.from("products").update({ is_active: true }).eq("name_en", "Tiramisu"),
    db.from("products").delete().eq("name_en", productName),
    db.from("count_schedules").delete().eq("time_of_day", scheduleTime),
  ]);
  for (const { error } of results) if (error) throw error;
}

export function randomTestPhone(): { local: string; e164: string } {
  const rest = String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0");
  return { local: `079${rest}`, e164: `96279${rest}` };
}

type AppSettingsPatch = Database["public"]["Tables"]["app_settings"]["Update"];

/** بيغيّر الإعدادات العامة، وبيرجع دالة بترجّع القيم القديمة. */
export async function updateAppSettings(patch: AppSettingsPatch) {
  const db = serviceClient();
  const { data: before, error } = await db.from("app_settings").select("*").eq("id", true).single();
  if (error) throw error;
  const { error: updateError } = await db.from("app_settings").update(patch).eq("id", true);
  if (updateError) throw updateError;
  const restore = Object.fromEntries(
    Object.keys(patch).map((k) => [k, before[k as keyof typeof before]]),
  ) as AppSettingsPatch;
  return async () => {
    await db.from("app_settings").update(restore).eq("id", true);
  };
}

/** آخر إخراج لموقع، مع إذا في سطر طلع بتجاوز FEFO. */
export async function latestDispatchTo(locationCode: string) {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", locationCode).single();
  const { data, error } = await db
    .from("dispatches")
    .select(
      "id, kind, status, dispatch_lines(dispatch_line_batches(is_fefo_override, override_confirmed_by))",
    )
    .eq("to_location_id", loc!.id)
    .order("dispatched_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  const fefoOverride = data.dispatch_lines.some((l) =>
    l.dispatch_line_batches.some((b) => b.is_fefo_override && b.override_confirmed_by),
  );
  return { id: data.id, kind: data.kind, status: data.status, fefoOverride };
}

/** بيشيل كل الحدود الدنيا وإشعاراتها (بعد اختبار الحد الأدنى). */
export async function clearMinLevels() {
  const db = serviceClient();
  await db.from("par_levels").update({ min_pieces: null }).not("min_pieces", "is", null);
  await db.from("notification_log").delete().eq("kind", "below_min");
}

/** بيلغي طلبات فرع انعملت من وقت معين (مشان ما توصل لاختبارات الإخراج). */
export async function cancelRequestsSince(locationCode: string, sinceIso: string) {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", locationCode).single();
  await db
    .from("stock_requests")
    .update({ status: "cancelled" })
    .eq("requesting_location_id", loc!.id)
    .gte("requested_at", sinceIso)
    .in("status", ["sent", "pending_approval"]);
}
