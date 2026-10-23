// أول أدمن بقاعدة بيانات جديدة (السحابة أو محلي). بعدها كل الموظفين بينضافوا من لوحة الإدارة.
//
//   node --env-file=.env.production.local scripts/create-admin.ts "عدنان" 07XXXXXXXX
//
// بيرفض إذا في أدمن فعّال أصلاً. الرمز (6 أرقام) بيطلع بالـ terminal مرة وحدة وما بينحفظ.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizePhone } from "../src/features/auth/phone.ts";
import { authEmailFor, derivePassword, generatePin } from "../src/features/auth/pin.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Run with --env-file=<file>`);
  return value;
}

async function main() {
  const fullName = (process.argv[2] ?? "").trim();
  const phone = normalizePhone(process.argv[3] ?? "");
  if (!fullName || !phone) throw new Error('Usage: create-admin.ts "الاسم" 07XXXXXXXX');

  const db = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pepper = requireEnv("AUTH_PIN_PEPPER");

  const { data: admins, error: adminsError } = await db
    .from("staff_roles")
    .select("staff_id, staff!staff_roles_staff_id_fkey!inner(is_active)")
    .eq("role", "admin")
    .eq("staff.is_active", true);
  if (adminsError) throw adminsError;
  if (admins.length > 0)
    throw new Error("An active admin already exists. Add staff from the admin panel instead.");

  const id = randomUUID();
  const pin = generatePin(6);
  const { error: authError } = await db.auth.admin.createUser({
    id,
    email: authEmailFor(id),
    password: derivePassword(pepper, id, pin),
    email_confirm: true,
  });
  if (authError) throw authError;

  const { error: staffError } = await db
    .from("staff")
    .insert({ id, full_name: fullName, phone, location_id: null });
  if (staffError) {
    await db.auth.admin.deleteUser(id);
    throw staffError;
  }
  const { error: roleError } = await db.from("staff_roles").insert({ staff_id: id, role: "admin" });
  if (roleError) throw roleError;

  console.log(`انضاف الأدمن: ${fullName}`);
  console.log(`رمز الدخول (مرة وحدة): ${pin}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
