import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type LocationKind = Database["public"]["Enums"]["location_kind"];

export interface CurrentStaff {
  id: string;
  fullName: string;
  roles: AppRole[];
  location: { id: string; name: string; kind: LocationKind } | null;
}

/**
 * الموظف الداخل حالياً، مقروء بجلسته (RLS). الموقوف بيرجع null حتى لو جلسته لسا شغالة.
 * ما في كاش بين الطلبات عن قصد: الإيقاف لازم يبين من أول ضغطة.
 */
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  // الجلسة (ووقتها) لكل طلب لحاله: Next ما بيحاول يجهز هالجزء مسبقاً
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("staff")
    .select(
      "id, full_name, is_active, location:locations(id, name, kind), staff_roles!staff_roles_staff_id_fkey(role)",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load the signed-in staff member: ${error.message}`);
  if (!data || !data.is_active) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    roles: data.staff_roles.map((r) => r.role),
    location: data.location,
  };
});

/** للصفحات: إذا ما في موظف فعّال، بنطلع الجلسة (لو موقوف) وبنروح على شاشة الدخول. */
export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/auth/signout");
  return staff;
}

export async function requireAdmin(): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!staff.roles.includes("admin")) redirect("/");
  return staff;
}
