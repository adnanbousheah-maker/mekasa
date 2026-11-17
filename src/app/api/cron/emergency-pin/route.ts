import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { derivePassword, generatePin, pinLengthFor, type PinRole } from "@/features/auth/pin";
import { cronSecret, serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

// طوارئ: رمز جديد لموظف (مثلاً الأدمن الوحيد انقفل). بدّه CRON_SECRET وطلب بجدول
// emergency_pin_requests انكتب من قاعدة البيانات خلال آخر 10 دقايق وما انستعمل.
// بيرجع الرمز مرة وحدة. البديل المحلي: scripts/reset-pin.ts.
const REQUEST_TTL_MS = 10 * 60 * 1000;
const bodySchema = z.object({ requestId: z.uuid() });

function authorized(request: NextRequest): boolean {
  const secret = cronSecret();
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return (
    !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  );
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const db = createAdminClient();
  // الطلب بينحجز أول (used_at) مشان ما ينستعمل مرتين
  const { data: claimed, error: claimError } = await db
    .from("emergency_pin_requests")
    .update({ used_at: new Date().toISOString() })
    .eq("id", body.data.requestId)
    .is("used_at", null)
    .gte("requested_at", new Date(Date.now() - REQUEST_TTL_MS).toISOString())
    .select("staff_id")
    .maybeSingle();
  if (claimError || !claimed) return NextResponse.json({ error: "no valid request" }, { status: 404 });

  const { data: staff, error: staffError } = await db
    .from("staff")
    .select("id, full_name, is_active, staff_roles!staff_roles_staff_id_fkey(role)")
    .eq("id", claimed.staff_id)
    .maybeSingle();
  if (staffError || !staff?.is_active)
    return NextResponse.json({ error: "staff not active" }, { status: 404 });

  const pin = generatePin(pinLengthFor(staff.staff_roles.map((r: { role: PinRole }) => r.role)));
  const { error: authError } = await db.auth.admin.updateUserById(staff.id, {
    password: derivePassword(serverEnv().AUTH_PIN_PEPPER, staff.id, pin),
  });
  if (authError) {
    console.error("emergency-pin: password", authError);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  await db
    .from("staff")
    .update({ failed_pin_attempts: 0, locked_until: null, requires_admin_reset: false })
    .eq("id", staff.id);
  await db.from("audit_log").insert({
    table_name: "staff",
    row_id: staff.id,
    action: "update",
    reason: "رمز طوارئ من السيرفر (emergency-pin)",
  });

  return NextResponse.json({ name: staff.full_name, pin });
}
