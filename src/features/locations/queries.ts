import "server-only";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface AdminLocation {
  id: string;
  name: string;
  kind: "branch" | "factory" | "packaging";
}

const KIND_RANK: Record<AdminLocation["kind"], number> = { branch: 0, factory: 1, packaging: 2 };

/** الفروع أول، وبعدين المصنع ومستودع التغليف (بدون خانة المرتجعات). */
export async function listAdminLocations(): Promise<AdminLocation[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, kind")
    .in("kind", ["branch", "factory", "packaging"])
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Could not load locations: ${error.message}`);
  return (data as AdminLocation[]).sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

export interface LocationItem {
  id: string;
  nameEn: string;
  piecesPerCake: number | null;
}

/** أصناف الموقع: التغليف للمستودع، والكيك للباقي. */
export async function locationItems(kind: AdminLocation["kind"]): Promise<LocationItem[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_products")
    .select("id, name_en, effective_pieces_per_cake")
    .eq("is_active", true)
    .eq("kind", kind === "packaging" ? "packaging" : "cake")
    .order("sort_order");
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return data.map((p) => ({ id: p.id!, nameEn: p.name_en!, piecesPerCake: p.effective_pieces_per_cake }));
}

/** الأصناف اللي قربت تخلص مدتها بالفرع. */
export async function nearExpiryAt(locationId: string): Promise<Set<string>> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_branch_stock_age")
    .select("product_id")
    .eq("location_id", locationId)
    .eq("near_expiry", true);
  return new Set((data ?? []).map((r) => r.product_id!));
}
