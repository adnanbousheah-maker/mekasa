import "server-only";
import { requireStaff, type CurrentStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface PackagingStore {
  id: string;
  name: string;
}

/** أمين التغليف بيشتغل بالمستودع وين ما كان موقعه (الدور مش الموقع). */
export function isPackagingKeeper(staff: CurrentStaff): boolean {
  return staff.roles.includes("packaging_keeper");
}

/** أول مستودع تغليف فعّال (نفس private.packaging_store بقاعدة البيانات). */
export async function packagingStore(): Promise<PackagingStore | null> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .eq("kind", "packaging")
    .eq("is_active", true)
    .order("sort_order")
    .order("name")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the packaging store: ${error.message}`);
  return data;
}

/** ستوك المستودع لكل مادة تغليف، بالحبة. */
export async function packagingStock(storeId: string): Promise<Map<string, number>> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_stock_by_product")
    .select("product_id, qty_pieces")
    .eq("location_id", storeId);
  if (error) throw new Error(`Could not load packaging stock: ${error.message}`);
  return new Map(data.map((s) => [s.product_id!, s.qty_pieces ?? 0]));
}

/** عدد طلبات التغليف اللي بانتظار الإخراج (للرئيسية). */
export async function pendingPackagingRequests(storeId: string): Promise<number> {
  await requireStaff();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("stock_requests")
    .select("id", { count: "exact", head: true })
    .eq("supplying_location_id", storeId)
    .eq("status", "sent");
  if (error) throw new Error(`Could not load packaging requests: ${error.message}`);
  return count ?? 0;
}

/** مواد المستودع اللي تحت الحد الأدنى: [مادة] → الحد بالحبة. */
export async function packagingBelowMin(storeId: string): Promise<Map<string, number>> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_below_min")
    .select("product_id, min_pieces")
    .eq("location_id", storeId);
  if (error) throw new Error(`Could not load packaging minimums: ${error.message}`);
  return new Map(data.map((b) => [b.product_id!, b.min_pieces!]));
}
