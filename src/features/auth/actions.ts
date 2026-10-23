"use server";

import { isIP } from "node:net";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_FAILED_MESSAGE, MIN_FAILURE_RESPONSE_MS, waitUntilElapsed } from "./lockout";
import { normalizePhone } from "./phone";
import { authEmailFor, derivePassword } from "./pin";

export type LoginState = { error: string } | undefined;

const loginSchema = z.object({
  phone: z.string().trim().min(1).max(30),
  pin: z.string().regex(/^\d{4,6}$/),
});

const TRY_AGAIN = "صار خطأ. جرب كمان مرة، وإذا ضل، احكي مع المدير.";

/**
 * الدخول برقم الجوال والرمز، كله على السيرفر.
 * 1. auth_reserve_login_attempt بتسجل المحاولة وبتحسبها غلط قبل الفحص (بقفل على صف الموظف)،
 *    فالطلبات المتزامنة ما بتتخطى القفل.
 * 2. إذا الحساب مفتوح، بنفحص الرمز بكلمة السر المشتقة.
 * 3. بس إذا صح، auth_record_login_success بتمسح العداد.
 * كل فشل إله نفس الرسالة ونفس الوقت تقريباً، مشان ما ينعرف إذا الرقم مسجل.
 */
export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const startedAt = Date.now();
  const parsed = loginSchema.safeParse({ phone: formData.get("phone"), pin: formData.get("pin") });
  if (!parsed.success) return { error: "اكتب رقم الجوال والرمز" };

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "رقم الجوال مش صحيح. مثال: 079 123 4567" };

  let signedIn = false;
  try {
    const admin = createAdminClient();
    const { data: attempt, error } = await admin
      .rpc("auth_reserve_login_attempt", { p_phone: phone, p_ip: await clientIp() })
      .single();
    if (error) throw error;

    if (attempt.status === "verify" && attempt.staff_id) {
      const supabase = await createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmailFor(attempt.staff_id),
        password: derivePassword(serverEnv().AUTH_PIN_PEPPER, attempt.staff_id, parsed.data.pin),
      });

      if (!signInError) {
        signedIn = true;
        const { error: recordError } = await admin.rpc("auth_record_login_success", {
          p_attempt_id: attempt.attempt_id,
          p_staff_id: attempt.staff_id,
        });
        // الجلسة انعملت؛ العداد بينمسح بالمرة الجاية إذا هالطلب فشل
        if (recordError) console.error("login: could not record success", recordError);
      } else if (signInError.code !== "invalid_credentials" && signInError.code !== "user_banned") {
        throw signInError;
      }
    }
  } catch (error) {
    console.error("login failed", error);
    await waitUntilElapsed(startedAt, MIN_FAILURE_RESPONSE_MS);
    return { error: TRY_AGAIN };
  }

  if (signedIn) redirect("/");

  await waitUntilElapsed(startedAt, MIN_FAILURE_RESPONSE_MS);
  return { error: LOGIN_FAILED_MESSAGE };
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  // local: بيطلع من هالجهاز بس، مش من كل أجهزة الموظف
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

/**
 * عنوان الجهاز من Vercel بس. x-forwarded-for بيقدر أي حدا يكتبه لما ما يكون في Vercel قدامنا،
 * فما بنستعمله. محلياً ما في عنوان، وحد الـ IP ما بيشتغل.
 */
async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  const candidate = (h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : undefined;
}
