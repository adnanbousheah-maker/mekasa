import "server-only";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface BranchHomeData {
  incoming: number;
  nearExpiry: string[];
  // تحت الحد الأدنى: اسم الصنف والموجود والحد (بالقطع)
  belowMin: { name: string; qty: number; min: number; piecesPerCake: number | null }[];
}

export interface FactoryHomeData {
  pendingRequests: number;
  lastDay: {
    productName: string;
    dayNumber: number;
    productionDate: string;
    shelfLifeDays: number;
    qty: number;
    piecesPerCake: number | null;
  }[];
  openReturns: number;
  returnsEnabled: boolean;
  rawBelowMin: string[];
  // كيك المصنع تحت الحد الأدنى
  belowMin: { name: string; qty: number; min: number; piecesPerCake: number | null }[];
}

async function productNames(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("v_products").select("id, name_en, effective_pieces_per_cake");
  return new Map((data ?? []).map((p) => [p.id!, { name: p.name_en!, ppc: p.effective_pieces_per_cake }]));
}

export async function branchHomeData(branchId: string): Promise<BranchHomeData> {
  await requireStaff();
  const supabase = await createClient();
  const [{ count }, { data: ages }, names, { data: below }] = await Promise.all([
    supabase
      .from("dispatches")
      .select("id", { count: "exact", head: true })
      .eq("to_location_id", branchId)
      .eq("status", "in_transit"),
    supabase
      .from("v_branch_stock_age")
      .select("product_id, near_expiry")
      .eq("location_id", branchId)
      .eq("near_expiry", true),
    productNames(supabase),
    supabase.from("v_below_min").select("product_id, qty_pieces, min_pieces").eq("location_id", branchId),
  ]);
  return {
    incoming: count ?? 0,
    nearExpiry: (ages ?? []).map((a) => names.get(a.product_id!)?.name ?? "").filter(Boolean),
    belowMin: (below ?? []).flatMap((b) => {
      const p = names.get(b.product_id!);
      return p ? [{ name: p.name, qty: b.qty_pieces!, min: b.min_pieces!, piecesPerCake: p.ppc }] : [];
    }),
  };
}

export async function factoryHomeData(factoryId: string): Promise<FactoryHomeData> {
  await requireStaff();
  const supabase = await createClient();
  const [{ count }, { data: batches }, { data: settings }, { data: raw }, names, { data: below }] =
    await Promise.all([
      supabase
        .from("stock_requests")
        .select("id", { count: "exact", head: true })
        .eq("supplying_location_id", factoryId)
        .eq("status", "sent"),
      supabase
        .from("v_factory_batches")
        .select("product_id, day_number, production_date, shelf_life_days, qty_pieces")
        .eq("location_id", factoryId)
        .eq("is_last_day", true)
        .gt("qty_pieces", 0),
      supabase.from("app_settings").select("returns_enabled").single(),
      supabase.from("v_raw_stock").select("material_id, below_min, location_id").eq("below_min", true),
      productNames(supabase),
      supabase.from("v_below_min").select("product_id, qty_pieces, min_pieces").eq("location_id", factoryId),
    ]);
  const { data: materials } = raw?.length
    ? await supabase
        .from("raw_materials")
        .select("id, name")
        .in(
          "id",
          raw.map((r) => r.material_id!),
        )
    : { data: [] };

  let openReturns = 0;
  if (settings?.returns_enabled) {
    const { data: bins } = await supabase
      .from("locations")
      .select("id")
      .eq("kind", "returns_bin")
      .eq("parent_location_id", factoryId);
    if (bins?.length) {
      const { data: stock } = await supabase
        .from("v_stock_by_product")
        .select("qty_pieces")
        .in(
          "location_id",
          bins.map((b) => b.id),
        );
      openReturns = (stock ?? []).filter((s) => (s.qty_pieces ?? 0) > 0).length;
    }
  }

  return {
    pendingRequests: count ?? 0,
    lastDay: (batches ?? []).map((b) => ({
      productName: names.get(b.product_id!)?.name ?? "",
      dayNumber: b.day_number!,
      productionDate: b.production_date!,
      shelfLifeDays: b.shelf_life_days ?? 7,
      qty: b.qty_pieces!,
      piecesPerCake: names.get(b.product_id!)?.ppc ?? null,
    })),
    openReturns,
    returnsEnabled: settings?.returns_enabled ?? false,
    rawBelowMin: (materials ?? []).map((m) => m.name),
    belowMin: (below ?? []).flatMap((b) => {
      const p = names.get(b.product_id!);
      return p ? [{ name: p.name, qty: b.qty_pieces!, min: b.min_pieces!, piecesPerCake: p.ppc }] : [];
    }),
  };
}
