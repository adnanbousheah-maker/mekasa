"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { normalizePhone } from "@/features/auth/phone";
import { authEmailFor, derivePassword, generatePin, pinLengthFor } from "@/features/auth/pin";
import { requireAdmin } from "@/features/auth/session";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ROLES, roleLocationProblem, type LocationKind, type Role } from "./roles";

export type StaffFormState =
  | { status: "error"; message: string }
  | { status: "created"; fullName: string; pin: string }
  // pin موجود لما الموظف صار أدمن: رمزه القديم ممكن حدا بيعرفه، فبياخذ رمز جديد
  | { status: "saved"; fullName: string; pin?: string }
  | undefined;

export type PinResetResult = { status: "error"; message: string } | { status: "done"; pin: string };
export type ActiveResult = { status: "error"; message: string } | { status: "done" };

const staffSchema = z.object({
  fullName: z.string().trim().min(1, "اكتب اسم الموظف").max(80, "الاسم طويل كثير"),
  phone: z.string().trim().min(1, "اكتب رقم الجوال"),
  locationId: z.union([z.uuid(), z.literal("")]),
  roles: z.array(z.enum(ROLES as [Role, ...Role[]])),
});

const staffIdSchema = z.uuid();

// يمنع الحساب من الدخول وتجديد الجلسة. الإيقاف نفسه بقاعدة البيانات.
const BANNED_FOREVER = "876000h";
const SAVE_FAILED = "ما انحفظ. جرب كمان مرة.";

type Validated = { fullName: string; phone: string; locationId: string | null; roles: Role[] };

async function validateStaffForm(formData: FormData): Promise<{ error: string } | { data: Validated }> {
  const parsed = staffSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    locationId: formData.get("locationId") ?? "",
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "رقم الجوال مش صحيح. مثال: 079 123 4567" };

  const locationId = parsed.data.locationId || null;
  let locationKind: LocationKind | null = null;
  if (locationId) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("locations")
      .select("kind")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: "الموقع مش موجود" };
    locationKind = data.kind;
  }

  const problem = roleLocationProblem(parsed.data.roles, locationKind);
  if (problem) return { error: problem };

  return { data: { fullName: parsed.data.fullName, phone, locationId, roles: parsed.data.roles } };
}

function saveErrorMessage(code: string | undefined): string {
  if (code === "23505") return "هالرقم مسجل لموظف ثاني";
  if (code === "23514") return "لازم يضل أدمن فعّال واحد على الأقل";
  return SAVE_FAILED;
}

async function saveStaff(staffId: string, data: Validated) {
  const supabase = await createClient();
  return supabase.rpc("admin_save_staff", {
    p_staff_id: staffId,
    p_full_name: data.fullName,
    p_phone: data.phone,
    // undefined = null بقاعدة البيانات (أدمن بدون موقع)
    p_location_id: data.locationId ?? undefined,
    p_roles: data.roles,
  });
}

/**
 * رمز جديد: كلمة السر أول، وبعدين فك القفل وتسجيله (بجلسة الأدمن).
 * هيك ما في حالة "انفك القفل والرمز القديم لسا شغال". Supabase بيلغي الجلسات القديمة مع تغيير كلمة السر.
 */
async function issueNewPin(staffId: string, roles: readonly Role[]): Promise<string | null> {
  const pin = generatePin(pinLengthFor(roles));
  const { error: authError } = await createAdminClient().auth.admin.updateUserById(staffId, {
    password: derivePassword(serverEnv().AUTH_PIN_PEPPER, staffId, pin),
  });
  if (authError) {
    console.error("issueNewPin: password", authError);
    return null;
  }

  const supabase = await createClient();
  const { error: recordError } = await supabase.rpc("admin_record_pin_reset", { p_staff_id: staffId });
  if (recordError) {
    // الرمز الجديد شغال بس القفل ممكن يضل؛ ما بنعرضه، والأدمن بيعيد
    console.error("issueNewPin: record", recordError);
    return null;
  }
  return pin;
}

/** موظف جديد: حساب دخول برمز عشوائي، وبعدين صفه وأدواره. الرمز بيرجع مرة وحدة للأدمن. */
export async function createStaffAction(
  _previous: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  await requireAdmin();
  const validated = await validateStaffForm(formData);
  if ("error" in validated) return { status: "error", message: validated.error };

  const staffId = randomUUID();
  const pin = generatePin(pinLengthFor(validated.data.roles));
  const admin = createAdminClient();

  const { error: authError } = await admin.auth.admin.createUser({
    id: staffId,
    email: authEmailFor(staffId),
    password: derivePassword(serverEnv().AUTH_PIN_PEPPER, staffId, pin),
    email_confirm: true,
  });
  if (authError) {
    console.error("createStaff: auth user", authError);
    return { status: "error", message: "ما انعمل الحساب. جرب كمان مرة." };
  }

  const { error } = await saveStaff(staffId, validated.data);
  if (error) {
    // ما بنخلي حساب دخول بدون موظف
    await admin.auth.admin.deleteUser(staffId);
    console.error("createStaff: save", error);
    return { status: "error", message: saveErrorMessage(error.code) };
  }

  refresh();
  return { status: "created", fullName: validated.data.fullName, pin };
}

export async function updateStaffAction(
  staffId: string,
  _previous: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  await requireAdmin();
  if (!staffIdSchema.safeParse(staffId).success) return { status: "error", message: "الموظف مش موجود" };

  const validated = await validateStaffForm(formData);
  if ("error" in validated) return { status: "error", message: validated.error };

  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("staff_id", staffId);
  if (readError) {
    console.error("updateStaff: read roles", readError);
    return { status: "error", message: SAVE_FAILED };
  }

  const { error } = await saveStaff(staffId, validated.data);
  if (error) {
    console.error("updateStaff", error);
    return { status: "error", message: saveErrorMessage(error.code) };
  }

  const becameAdmin = validated.data.roles.includes("admin") && !before.some((r) => r.role === "admin");
  if (becameAdmin) {
    const pin = await issueNewPin(staffId, validated.data.roles);
    refresh();
    if (!pin) {
      return {
        status: "error",
        message: "انحفظ، بس ما انعمل رمز الأدمن الجديد. اكبس «رمز جديد» من القائمة.",
      };
    }
    return { status: "saved", fullName: validated.data.fullName, pin };
  }

  refresh();
  return { status: "saved", fullName: validated.data.fullName };
}

export async function resetPinAction(staffId: string): Promise<PinResetResult> {
  await requireAdmin();
  if (!staffIdSchema.safeParse(staffId).success) return { status: "error", message: "الموظف مش موجود" };

  const supabase = await createClient();
  const { data: target, error: readError } = await supabase
    .from("staff")
    .select("id, staff_roles!staff_roles_staff_id_fkey(role)")
    .eq("id", staffId)
    .maybeSingle();
  if (readError || !target) return { status: "error", message: "الموظف مش موجود" };

  const pin = await issueNewPin(
    staffId,
    target.staff_roles.map((r) => r.role),
  );
  refresh();
  if (!pin) return { status: "error", message: "ما انعمل رمز جديد. جرب كمان مرة." };
  return { status: "done", pin };
}

/**
 * إيقاف: قاعدة البيانات أول (البيانات بتتسكر فوراً والجلسات بتنحذف)، وبعدين الحظر.
 * تفعيل: فك الحظر أول، وبعدين قاعدة البيانات، مشان ما يصير "فعّال بس محظور".
 */
export async function setStaffActiveAction(staffId: string, active: boolean): Promise<ActiveResult> {
  await requireAdmin();
  if (!staffIdSchema.safeParse(staffId).success) return { status: "error", message: "الموظف مش موجود" };

  const supabase = await createClient();
  const admin = createAdminClient();

  if (active) {
    const { error: unbanError } = await admin.auth.admin.updateUserById(staffId, { ban_duration: "none" });
    if (unbanError) {
      console.error("activate: unban", unbanError);
      return { status: "error", message: SAVE_FAILED };
    }
  }

  const { error } = await supabase.rpc("admin_set_staff_active", { p_staff_id: staffId, p_active: active });
  if (error) {
    console.error("setStaffActive", error);
    const message = error.code === "23514" ? "ما بتقدر توقف حسابك، ولازم يضل أدمن فعّال" : SAVE_FAILED;
    return { status: "error", message };
  }

  if (!active) {
    // حماية زيادة بس: الموقوف أصلاً ما بيوصل لفحص الرمز (auth_reserve_login_attempt)،
    // وجلساته انحذفت، والـ RLS مسكّرة عليه. فإذا فشل الحظر بنسجل الخطأ وبس.
    const { error: banError } = await admin.auth.admin.updateUserById(staffId, {
      ban_duration: BANNED_FOREVER,
    });
    if (banError) console.error("deactivate: ban", banError);
  }

  refresh();
  return { status: "done" };
}
