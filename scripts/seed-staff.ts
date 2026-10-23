// موظفين تجريبيين للتطوير المحلي، واحد لكل دور. شغّله بعد `npm run db:reset`:
//   npm run db:seed-staff
// بيرفض يشتغل على أي Supabase غير المحلي، لأن الرموز هون معروفة.
// (ما بنضيفهم بـ seed.sql لأن كلمة السر مشتقة بـ AUTH_PIN_PEPPER اللي بـ .env.local بس.)

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { authEmailFor, derivePassword } from "../src/features/auth/pin.ts";

type Role = "admin" | "branch_staff" | "dispatcher" | "storekeeper";

interface TestStaff {
  fullName: string;
  phone: string;
  locationCode: string | null;
  roles: Role[];
  pin: string;
}

// رموز تجريبية للجهاز المحلي بس. الرقم اللي بتكتبه بشاشة الدخول: 0790000001 …
const TEST_STAFF: TestStaff[] = [
  { fullName: "عدنان", phone: "962790000001", locationCode: null, roles: ["admin"], pin: "246813" },
  { fullName: "أحمد", phone: "962790000002", locationCode: "SWF", roles: ["branch_staff"], pin: "2580" },
  { fullName: "رنا", phone: "962790000003", locationCode: "JBH", roles: ["branch_staff"], pin: "1470" },
  { fullName: "خالد", phone: "962790000004", locationCode: "DBQ", roles: ["branch_staff"], pin: "3690" },
  {
    fullName: "سامر",
    phone: "962790000005",
    locationCode: "FAC",
    roles: ["dispatcher", "storekeeper"],
    pin: "1593",
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Run with --env-file=.env.local`);
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const pepper = requireEnv("AUTH_PIN_PEPPER");

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed test staff with NODE_ENV=production.");
  }
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to seed test staff with known PINs into ${host}. Local Supabase only.`);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: locations, error: locationsError } = await db.from("locations").select("id, code");
  if (locationsError) throw locationsError;
  const locationId = (code: string | null) =>
    code ? (locations.find((l) => l.code === code)?.id ?? null) : null;

  for (const person of TEST_STAFF) {
    const { data: existing, error: existingError } = await db
      .from("staff")
      .select("id")
      .eq("phone", person.phone)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      console.log(`موجود: ${person.fullName}`);
      continue;
    }

    const id = randomUUID();
    const { error: authError } = await db.auth.admin.createUser({
      id,
      email: authEmailFor(id),
      password: derivePassword(pepper, id, person.pin),
      email_confirm: true,
    });
    if (authError) throw authError;

    const { error: staffError } = await db.from("staff").insert({
      id,
      full_name: person.fullName,
      phone: person.phone,
      location_id: locationId(person.locationCode),
    });
    if (staffError) throw staffError;

    const { error: rolesError } = await db
      .from("staff_roles")
      .insert(person.roles.map((role) => ({ staff_id: id, role })));
    if (rolesError) throw rolesError;

    console.log(`انضاف: ${person.fullName} (${person.roles.join("، ")})`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
