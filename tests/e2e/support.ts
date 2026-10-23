import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

// موظفين scripts/seed-staff.ts (لازم `npm run db:seed-staff` قبل الاختبارات)
export const ADMIN = { phone: "0790000001", pin: "246813", name: "عدنان" };
export const BRANCH = { phone: "0790000002", pin: "2580", name: "أحمد", e164: "962790000002" };

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

export function randomTestPhone(): { local: string; e164: string } {
  const rest = String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0");
  return { local: `079${rest}`, e164: `96279${rest}` };
}
