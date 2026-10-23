// للطوارئ بس: لما الأدمن الوحيد ينقفل (10 محاولات غلط) وما في حدا يعطيه رمز جديد من اللوحة.
// بيعطي الموظف رمز جديد وبيفك القفل مباشرة بـ service role، وبيسجلها بسجل التعديلات.
//
//   محلياً:  npm run staff:reset-pin -- 0790000001
//   السحابة: node --env-file=.env.production.local scripts/reset-pin.ts 07XXXXXXXX
//            (ملف فيه مفاتيح السحابة، عند صاحب المشروع بس)
//
// الرمز بيطلع بالـ terminal مرة وحدة. ما بيفعّل موظف موقوف.

import { createClient } from "@supabase/supabase-js";
import { normalizePhone } from "../src/features/auth/phone.ts";
import { derivePassword, generatePin, pinLengthFor, type PinRole } from "../src/features/auth/pin.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Run with --env-file=<file>`);
  return value;
}

async function main() {
  const phone = normalizePhone(process.argv[2] ?? "");
  if (!phone) throw new Error("Usage: reset-pin.ts 07XXXXXXXX");

  const db = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: staff, error } = await db
    .from("staff")
    .select("id, full_name, is_active, staff_roles!staff_roles_staff_id_fkey(role)")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  if (!staff) throw new Error("No staff member with that phone.");
  if (!staff.is_active) throw new Error("That staff member is deactivated. Activate them first.");

  const roles = staff.staff_roles.map((r: { role: PinRole }) => r.role);
  const pin = generatePin(pinLengthFor(roles));

  const { error: authError } = await db.auth.admin.updateUserById(staff.id, {
    password: derivePassword(requireEnv("AUTH_PIN_PEPPER"), staff.id, pin),
  });
  if (authError) throw authError;

  const { error: unlockError } = await db
    .from("staff")
    .update({ failed_pin_attempts: 0, locked_until: null, requires_admin_reset: false })
    .eq("id", staff.id);
  if (unlockError) throw unlockError;

  const { error: auditError } = await db.from("audit_log").insert({
    table_name: "staff",
    row_id: staff.id,
    action: "update",
    reason: "رمز طوارئ من السكربت (scripts/reset-pin.ts)",
  });
  if (auditError) throw auditError;

  console.log(`${staff.full_name}: الرمز الجديد ${pin}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
