import "server-only";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { LocationKind, Role } from "./roles";

export interface StaffRow {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  lastLoginAt: string | null;
  isLocked: boolean;
  location: { id: string; name: string; kind: LocationKind } | null;
  roles: Role[];
}

export interface LocationOption {
  id: string;
  name: string;
  kind: LocationKind;
}

const STAFF_COLUMNS =
  "id, full_name, phone, is_active, last_login_at, locked_until, requires_admin_reset, location:locations(id, name, kind), staff_roles!staff_roles_staff_id_fkey(role)";

type StaffRecord = {
  id: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  last_login_at: string | null;
  locked_until: string | null;
  requires_admin_reset: boolean;
  location: { id: string; name: string; kind: LocationKind } | null;
  staff_roles: { role: Role }[];
};

function toStaffRow(record: StaffRecord, now: Date): StaffRow {
  return {
    id: record.id,
    fullName: record.full_name,
    phone: record.phone,
    isActive: record.is_active,
    lastLoginAt: record.last_login_at,
    isLocked:
      record.requires_admin_reset || (record.locked_until !== null && new Date(record.locked_until) > now),
    location: record.location,
    roles: record.staff_roles.map((r) => r.role),
  };
}

/** كل الموظفين، الفعّالين أول. RLS بيرجعهم كلهم للأدمن بس. */
export async function listStaff(): Promise<StaffRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_COLUMNS)
    .order("is_active", { ascending: false })
    .order("full_name");
  if (error) throw new Error(`Could not load staff: ${error.message}`);
  const now = new Date();
  return data.map((record) => toStaffRow(record, now));
}

export async function getStaff(staffId: string): Promise<StaffRow | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff").select(STAFF_COLUMNS).eq("id", staffId).maybeSingle();
  if (error) throw new Error(`Could not load the staff member: ${error.message}`);
  return data ? toStaffRow(data, new Date()) : null;
}

/** المواقع اللي ممكن يشتغل فيها موظف (مش خانة المرتجعات). */
export async function listWorkLocations(): Promise<LocationOption[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, kind")
    .in("kind", ["factory", "branch"])
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Could not load locations: ${error.message}`);
  return data;
}
