import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

// موظفين scripts/seed-staff.ts (لازم `npm run db:seed-staff` قبل الاختبارات)
export const ADMIN = { phone: "0790000001", pin: "246813", name: "عدنان" };
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
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
