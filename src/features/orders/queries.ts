import "server-only";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { recentDates } from "@/lib/day-number";
import { businessDate } from "@/lib/time";

export interface OrderProduct {
  id: string;
  nameEn: string;
  piecesPerCake: number | null;
  stockPieces: number;
  parPieces: number | undefined;
  // معدل استهلاك آخر 4 أيام من نفس يوم بكرا (null = ما في جرد بهالأيام)
  avgPieces: number | null;
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function products(supabase: Db) {
  const { data, error } = await supabase
    .from("v_products")
    .select("id, name_en, effective_pieces_per_cake, is_active, kind, effective_shelf_life_days")
    .order("sort_order");
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return data.map((p) => ({
    id: p.id!,
    nameEn: p.name_en!,
    piecesPerCake: p.effective_pieces_per_cake,
    isActive: p.is_active!,
    kind: p.kind!,
    shelfLifeDays: p.effective_shelf_life_days ?? 7,
  }));
}

async function namesOf(supabase: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("v_staff_names")
    .select("id, full_name")
    .in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((s) => [s.id!, s.full_name!]));
}

/** الأصناف الفعّالة مع الموجود والحد المطلوب بفرع (للطلب وللإخراج). */
export async function productsForBranch(
  branchId: string,
  kind: "cake" | "packaging" = "cake",
): Promise<OrderProduct[]> {
  await requireStaff();
  const supabase = await createClient();
  const [all, { data, error }] = await Promise.all([
    products(supabase),
    supabase.rpc("branch_suggestions", { p_branch_id: branchId }),
  ]);
  if (error) throw new Error(`Could not load suggestions: ${error.message}`);
  const byId = new Map(data.map((s) => [s.product_id, s]));
  return all
    .filter((p) => p.isActive && p.kind === kind)
    .map((p) => ({
      id: p.id,
      nameEn: p.nameEn,
      piecesPerCake: p.piecesPerCake,
      stockPieces: byId.get(p.id)?.stock_pieces ?? 0,
      parPieces: byId.get(p.id)?.par_pieces ?? undefined,
      avgPieces: byId.get(p.id)?.avg_pieces ?? null,
    }));
}

export interface DocLine {
  productId: string;
  productName: string;
  piecesPerCake: number | null;
  wholeCakes: number;
  loosePieces: number;
  qtyPieces: number;
}

export interface RequestDoc {
  id: string;
  status: "pending_approval" | "sent" | "dispatched" | "received" | "cancelled";
  requestedAt: string;
  requestedBy: string;
  fromName: string;
  toName: string;
  requestingLocationId: string;
  // طلب من مستودع التغليف
  isPackaging: boolean;
  lines: (DocLine & { lineId: string; suggestedPieces: number | null })[];
  // أصناف كانت مقترحة والفرع بعت بدونها
  missing: {
    productId: string;
    productName: string;
    piecesPerCake: number | null;
    suggestedPieces: number;
  }[];
}

export interface DispatchDoc {
  id: string;
  kind: "replenishment" | "transfer" | "return";
  status: "in_transit" | "received" | "cancelled";
  requestId: string | null;
  fromLocationId: string;
  toLocationId: string;
  fromName: string;
  toName: string;
  dispatchedAt: string;
  dispatchedBy: string;
  driverName: string | null;
  hoursInTransit: number;
  lines: (DocLine & {
    lineId: string;
    requestLineId: string | null;
    batches: { dayNumber: number; productionDate: string; qtyPieces: number; isOverride: boolean }[];
    received: {
      wholeCakes: number;
      loosePieces: number;
      qtyPieces: number;
      note: string | null;
      lineId: string;
      resolution: string | null;
      // تالف بالتوصيل، بالقطع
      damagedPieces: number;
    } | null;
  })[];
  receivedAt: string | null;
  receivedBy: string | null;
}

const REQUEST_COLUMNS =
  "id, status, requested_at, requested_by, requesting_location_id, requesting:locations!stock_requests_requesting_location_id_fkey(name), supplying:locations!stock_requests_supplying_location_id_fkey(name, kind), stock_request_lines(id, product_id, whole_cakes, loose_pieces, qty_pieces, pieces_per_cake_snapshot, suggested_pieces), stock_request_missing(product_id, suggested_pieces)";

const DISPATCH_COLUMNS =
  "id, kind, status, request_id, from_location_id, to_location_id, dispatched_at, dispatched_by, driver_name, from:locations!dispatches_from_location_id_fkey(name), to:locations!dispatches_to_location_id_fkey(name), dispatch_lines(id, product_id, request_line_id, whole_cakes, loose_pieces, qty_pieces, pieces_per_cake_snapshot, dispatch_line_batches(qty_pieces, is_fefo_override, batch:batches(production_date, day_number))), receipts(received_at, received_by, receipt_lines(id, dispatch_line_id, whole_cakes, loose_pieces, qty_pieces, note, resolution, damaged_pieces))";

/** الطلبات والإخراجات حسب فلتر. RLS بتخلي كل واحد يشوف اللي إله علاقة فيه بس. */
export async function loadDocuments(filter: {
  requests?: {
    requestingLocationId?: string;
    supplyingLocationId?: string;
    statuses?: RequestDoc["status"][];
    ids?: string[];
  };
  dispatches?: {
    fromLocationId?: string;
    toLocationId?: string;
    statuses?: DispatchDoc["status"][];
    ids?: string[];
    requestIds?: string[];
  };
  sinceDays?: number;
}): Promise<{ requests: RequestDoc[]; dispatches: DispatchDoc[] }> {
  await requireStaff();
  const supabase = await createClient();
  const since = new Date(Date.now() - (filter.sinceDays ?? 30) * 86_400_000).toISOString();

  let rq = supabase
    .from("stock_requests")
    .select(REQUEST_COLUMNS)
    .gte("requested_at", since)
    .order("requested_at", { ascending: false });
  if (filter.requests?.requestingLocationId)
    rq = rq.eq("requesting_location_id", filter.requests.requestingLocationId);
  if (filter.requests?.supplyingLocationId)
    rq = rq.eq("supplying_location_id", filter.requests.supplyingLocationId);
  if (filter.requests?.statuses) rq = rq.in("status", filter.requests.statuses);
  if (filter.requests?.ids) rq = rq.in("id", filter.requests.ids);

  let dq = supabase
    .from("dispatches")
    .select(DISPATCH_COLUMNS)
    .gte("dispatched_at", since)
    .order("dispatched_at", { ascending: false });
  if (filter.dispatches?.fromLocationId) dq = dq.eq("from_location_id", filter.dispatches.fromLocationId);
  if (filter.dispatches?.toLocationId) dq = dq.eq("to_location_id", filter.dispatches.toLocationId);
  if (filter.dispatches?.statuses) dq = dq.in("status", filter.dispatches.statuses);
  if (filter.dispatches?.ids) dq = dq.in("id", filter.dispatches.ids);
  if (filter.dispatches?.requestIds) dq = dq.in("request_id", filter.dispatches.requestIds);

  const [requests, dispatches, allProducts] = await Promise.all([
    filter.requests ? rq : Promise.resolve({ data: [], error: null }),
    filter.dispatches ? dq : Promise.resolve({ data: [], error: null }),
    products(supabase),
  ]);
  if (requests.error) throw new Error(`Could not load requests: ${requests.error.message}`);
  if (dispatches.error) throw new Error(`Could not load dispatches: ${dispatches.error.message}`);
  const productNames = new Map(allProducts.map((p) => [p.id, p.nameEn]));
  const productSizes = new Map(allProducts.map((p) => [p.id, p.piecesPerCake]));
  const names = await namesOf(supabase, [
    ...requests.data.map((r) => r.requested_by),
    ...dispatches.data.map((d) => d.dispatched_by),
    ...dispatches.data.flatMap((d) => (d.receipts ? [d.receipts.received_by] : [])),
  ]);

  return {
    requests: requests.data.map((r) => ({
      id: r.id,
      status: r.status,
      requestedAt: r.requested_at,
      requestedBy: names.get(r.requested_by) ?? "",
      fromName: r.requesting.name,
      toName: r.supplying.name,
      requestingLocationId: r.requesting_location_id,
      isPackaging: r.supplying.kind === "packaging",
      lines: r.stock_request_lines.map((l) => ({
        lineId: l.id,
        productId: l.product_id,
        productName: productNames.get(l.product_id) ?? "",
        piecesPerCake: l.pieces_per_cake_snapshot,
        wholeCakes: l.whole_cakes,
        loosePieces: l.loose_pieces,
        qtyPieces: l.qty_pieces ?? 0,
        suggestedPieces: l.suggested_pieces,
      })),
      missing: r.stock_request_missing.map((m) => ({
        productId: m.product_id,
        productName: productNames.get(m.product_id) ?? "",
        piecesPerCake: productSizes.get(m.product_id) ?? null,
        suggestedPieces: m.suggested_pieces,
      })),
    })),
    dispatches: dispatches.data.map((d) => {
      const receipt = d.receipts;
      const received = new Map((receipt?.receipt_lines ?? []).map((rl) => [rl.dispatch_line_id, rl]));
      return {
        id: d.id,
        kind: d.kind,
        status: d.status,
        requestId: d.request_id,
        fromLocationId: d.from_location_id,
        toLocationId: d.to_location_id,
        fromName: d.from.name,
        toName: d.to.name,
        dispatchedAt: d.dispatched_at,
        dispatchedBy: names.get(d.dispatched_by) ?? "",
        driverName: d.driver_name,
        hoursInTransit: (Date.now() - new Date(d.dispatched_at).getTime()) / 3_600_000,
        receivedAt: receipt?.received_at ?? null,
        receivedBy: receipt ? (names.get(receipt.received_by) ?? "") : null,
        lines: d.dispatch_lines.map((l) => {
          const got = received.get(l.id);
          return {
            lineId: l.id,
            productId: l.product_id,
            productName: productNames.get(l.product_id) ?? "",
            piecesPerCake: l.pieces_per_cake_snapshot,
            wholeCakes: l.whole_cakes,
            loosePieces: l.loose_pieces,
            qtyPieces: l.qty_pieces ?? 0,
            requestLineId: l.request_line_id,
            batches: l.dispatch_line_batches
              .map((b) => ({
                dayNumber: b.batch.day_number ?? 0,
                productionDate: b.batch.production_date,
                qtyPieces: b.qty_pieces,
                isOverride: b.is_fefo_override,
              }))
              .sort((a, b) => a.productionDate.localeCompare(b.productionDate)),
            received: got
              ? {
                  lineId: got.id,
                  wholeCakes: got.whole_cakes,
                  loosePieces: got.loose_pieces,
                  qtyPieces: got.qty_pieces ?? 0,
                  note: got.note,
                  resolution: got.resolution,
                  damagedPieces: got.damaged_pieces,
                }
              : null,
          };
        }),
      };
    }),
  };
}

export interface FactoryBatchStock {
  productId: string;
  productionDate: string;
  dayNumber: number;
  available: number;
  expired: boolean;
  lastDay: boolean;
  shelfLifeDays: number;
}

/** ستوك المصنع بالدفعات (للإخراج: الكميات بتبين للإخراج، الجرد بس أعمى). */
export async function factoryBatchStock(factoryId: string): Promise<FactoryBatchStock[]> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_factory_batches")
    .select("product_id, production_date, day_number, qty_pieces, is_expired, is_last_day, shelf_life_days")
    .eq("location_id", factoryId)
    .gt("qty_pieces", 0)
    .order("production_date");
  if (error) throw new Error(`Could not load factory batches: ${error.message}`);
  return data.map((b) => ({
    productId: b.product_id!,
    productionDate: b.production_date!,
    dayNumber: b.day_number!,
    available: b.qty_pieces!,
    expired: b.is_expired!,
    lastDay: b.is_last_day!,
    shelfLifeDays: b.shelf_life_days ?? 7,
  }));
}

export async function allActiveProducts(kind: "cake" | "packaging" = "cake") {
  await requireStaff();
  const supabase = await createClient();
  return (await products(supabase)).filter((p) => p.isActive && p.kind === kind);
}

export interface Destination {
  id: string;
  name: string;
  kind: "branch" | "returns_bin";
}

/** الوجهات: من المصنع للفروع، ومن الفرع للفروع الثانية (إذا التحويل مفعّل) والمرتجعات (إذا الإرجاع مفعّل). */
export async function destinationsFrom(location: { id: string; kind: string }): Promise<Destination[]> {
  await requireStaff();
  const supabase = await createClient();
  const [{ data: locations, error }, { data: settings }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, kind, parent_location_id")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("app_settings").select("branch_transfers_enabled, returns_enabled").single(),
  ]);
  if (error) throw new Error(`Could not load locations: ${error.message}`);
  if (location.kind === "factory" || location.kind === "packaging") {
    return locations
      .filter((l) => l.kind === "branch")
      .map((l) => ({ id: l.id, name: l.name, kind: "branch" as const }));
  }
  return [
    ...(settings?.branch_transfers_enabled
      ? locations
          .filter((l) => l.kind === "branch" && l.id !== location.id)
          .map((l) => ({ id: l.id, name: l.name, kind: "branch" as const }))
      : []),
    ...(settings?.returns_enabled
      ? locations
          .filter((l) => l.kind === "returns_bin")
          .map((l) => ({ id: l.id, name: l.name, kind: "returns_bin" as const }))
      : []),
  ];
}

/** إنتاج اليوم بالمصنع (للرسالة "سجلت اليوم الساعة 7:30: 24 كيكة"). */
export async function productionToday(factoryId: string) {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_entries")
    .select("recorded_at, production_lines(product_id, whole_cakes, loose_pieces, qty_pieces)")
    .eq("location_id", factoryId)
    .eq("production_date", businessDate(new Date()))
    .order("recorded_at");
  if (error) throw new Error(`Could not load production: ${error.message}`);
  return data;
}

export function shelfDates(today: string, days: number): string[] {
  return recentDates(today, days);
}

export interface OpenReturn {
  receiptLineId: string;
  productName: string;
  piecesPerCake: number | null;
  fromName: string;
  receivedAt: string;
  remaining: number;
}

/** المرتجعات بخانة المرتجعات اللي لسا ما انقرر عليها (كلها أو جزء منها). */
export async function listOpenReturns(factoryId: string): Promise<OpenReturn[]> {
  await requireStaff();
  const supabase = await createClient();
  const { data: bins } = await supabase
    .from("locations")
    .select("id")
    .eq("kind", "returns_bin")
    .eq("parent_location_id", factoryId);
  if (!bins?.length) return [];
  const [{ data, error }, all] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "received_at, dispatch:dispatches(from:locations!dispatches_from_location_id_fkey(name)), receipt_lines(id, qty_pieces, dispatch_line:dispatch_lines(product_id, pieces_per_cake_snapshot), return_dispositions(to_stock_pieces, to_waste_pieces))",
      )
      .in(
        "location_id",
        bins.map((b) => b.id),
      )
      .order("received_at", { ascending: false }),
    products(supabase),
  ]);
  if (error) throw new Error(`Could not load returns: ${error.message}`);
  const names = new Map(all.map((p) => [p.id, p.nameEn]));
  return data.flatMap((r) =>
    r.receipt_lines
      .map((l) => ({
        receiptLineId: l.id,
        productName: names.get(l.dispatch_line.product_id) ?? "",
        piecesPerCake: l.dispatch_line.pieces_per_cake_snapshot,
        fromName: r.dispatch.from.name,
        receivedAt: r.received_at,
        remaining:
          (l.qty_pieces ?? 0) -
          l.return_dispositions.reduce((s, d) => s + d.to_stock_pieces + d.to_waste_pieces, 0),
      }))
      .filter((l) => l.remaining > 0),
  );
}
