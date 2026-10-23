import "server-only";
import { requireAdmin } from "@/features/auth/session";
import { signedPhotoUrl } from "@/features/photos/queries";
import { createClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/time";
import { addDays, rangeStart, type Range } from "./format";

// قراءات لوحة الأدمن. كلها بجلسة الأدمن (RLS بتعطيه كل المواقع).

export interface ReportLocation {
  id: string;
  name: string;
  kind: "factory" | "branch";
}

export interface ReportProduct {
  id: string;
  nameEn: string;
  piecesPerCake: number | null;
  isActive: boolean;
}

async function db() {
  await requireAdmin();
  return createClient();
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Could not load ${what}: ${error?.message ?? "unknown"}`);
}

export async function listReportLocations(): Promise<ReportLocation[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, kind")
    .in("kind", ["factory", "branch"])
    .eq("is_active", true)
    .order("sort_order");
  if (error) fail("locations", error);
  return data as ReportLocation[];
}

export async function listReportProducts(): Promise<ReportProduct[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("v_products")
    .select("id, name_en, effective_pieces_per_cake, is_active")
    .order("sort_order");
  if (error) fail("products", error);
  return data.map((p) => ({
    id: p.id!,
    nameEn: p.name_en!,
    piecesPerCake: p.effective_pieces_per_cake,
    isActive: p.is_active!,
  }));
}

// ─── الستوك والاستهلاك ───────────────────────────────────────────────

/** الكمية الحالية بالقطع: [صنف][موقع]. */
export async function stockByProduct(): Promise<Map<string, Map<string, number>>> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("v_stock_by_product")
    .select("location_id, product_id, qty_pieces");
  if (error) fail("stock", error);
  const map = new Map<string, Map<string, number>>();
  for (const row of data) {
    const byLocation = map.get(row.product_id!) ?? new Map<string, number>();
    byLocation.set(row.location_id!, row.qty_pieces!);
    map.set(row.product_id!, byLocation);
  }
  return map;
}

/** الحد المطلوب بالقطع: [صنف][فرع]. */
export async function parLevels(): Promise<Map<string, Map<string, number>>> {
  const supabase = await db();
  const { data, error } = await supabase.from("par_levels").select("location_id, product_id, par_pieces");
  if (error) fail("par levels", error);
  const map = new Map<string, Map<string, number>>();
  for (const row of data) {
    const byLocation = map.get(row.product_id) ?? new Map<string, number>();
    byLocation.set(row.location_id, row.par_pieces);
    map.set(row.product_id, byLocation);
  }
  return map;
}

/** الاستهلاك بالقطع بين يومين (مع الطرفين، والنهاية افتراضياً اليوم): [صنف][فرع]. */
export async function consumptionSince(
  fromIso: string,
  untilIso?: string,
): Promise<Map<string, Map<string, number>>> {
  const supabase = await db();
  let query = supabase
    .from("v_count_consumption")
    .select("location_id, product_id, consumed_pieces")
    .gte("business_date", fromIso);
  if (untilIso) query = query.lte("business_date", untilIso);
  const { data, error } = await query;
  if (error) fail("consumption", error);
  const map = new Map<string, Map<string, number>>();
  for (const row of data) {
    const byLocation = map.get(row.product_id!) ?? new Map<string, number>();
    byLocation.set(row.location_id!, (byLocation.get(row.location_id!) ?? 0) + row.consumed_pieces!);
    map.set(row.product_id!, byLocation);
  }
  return map;
}

// ─── الجرودات ────────────────────────────────────────────────────────

export interface CountListRow {
  id: string;
  locationId: string;
  locationName: string;
  businessDate: string;
  startedAt: string;
  confirmedAt: string;
  method: "manual" | "photo";
  isOpening: boolean;
  countedBy: string;
  scheduleTime: string | null;
  lineCount: number;
  consumedCakes: number;
  consumedLooseOnly: number;
  impossibleLines: number;
  staffCorrectedLines: number;
  photoPath: string | null;
}

const COUNT_LIST_COLUMNS =
  "id, location_id, business_date, started_at, confirmed_at, method, is_opening, counted_by, schedule_time, line_count, consumed_cakes, consumed_loose_only, impossible_lines, staff_corrected_lines, photo_path";

async function staffNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await db();
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name")
    .in("id", [...new Set(ids)]);
  if (error) fail("staff names", error);
  return new Map(data.map((s) => [s.id, s.full_name]));
}

export async function listCounts(
  filter: { locationId?: string; limit?: number } = {},
): Promise<CountListRow[]> {
  const supabase = await db();
  let query = supabase
    .from("v_count_list")
    .select(COUNT_LIST_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.locationId) query = query.eq("location_id", filter.locationId);
  const [{ data, error }, locations] = await Promise.all([query, listReportLocations()]);
  if (error) fail("counts", error);
  const names = await staffNames(data.map((c) => c.counted_by!));
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  return data.map((c) => ({
    id: c.id!,
    locationId: c.location_id!,
    locationName: locationNames.get(c.location_id!) ?? "",
    businessDate: c.business_date!,
    startedAt: c.started_at!,
    confirmedAt: c.confirmed_at!,
    method: c.method!,
    isOpening: c.is_opening!,
    countedBy: names.get(c.counted_by!) ?? "",
    scheduleTime: c.schedule_time,
    lineCount: c.line_count!,
    consumedCakes: Number(c.consumed_cakes ?? 0),
    consumedLooseOnly: c.consumed_loose_only!,
    impossibleLines: c.impossible_lines!,
    staffCorrectedLines: c.staff_corrected_lines!,
    photoPath: c.photo_path,
  }));
}

export interface BreakdownLine {
  lineId: string;
  productId: string;
  productName: string;
  dayNumber: number | null;
  piecesPerCake: number | null;
  wholeCakes: number;
  loosePieces: number;
  counted: number;
  prev: number | null;
  in: number;
  out: number;
  waste: number;
  other: number;
  adjustment: number;
  expected: number;
  ocr: {
    wholeCakes: number | null;
    loosePieces: number | null;
    wholeConfidence: number | null;
    piecesConfidence: number | null;
  };
}

export interface AuditEntry {
  id: number;
  changedAt: string;
  changedBy: string;
  reason: string | null;
  productName: string;
  before: { wholeCakes: number; loosePieces: number };
  after: { wholeCakes: number; loosePieces: number };
}

export interface CountDetail {
  summary: CountListRow;
  locationKind: "factory" | "branch";
  lines: BreakdownLine[];
  audit: AuditEntry[];
  photoUrl: string | null;
}

export async function getCountDetail(countId: string): Promise<CountDetail | null> {
  const supabase = await db();
  const { data: row, error } = await supabase
    .from("v_count_list")
    .select(COUNT_LIST_COLUMNS)
    .eq("id", countId)
    .maybeSingle();
  if (error) fail("count", error);
  if (!row) return null;

  const [{ data: breakdown, error: bError }, products, locations, { data: batches }] = await Promise.all([
    supabase.rpc("count_breakdown", { p_count_id: countId }),
    listReportProducts(),
    listReportLocations(),
    supabase.from("batches").select("id, day_number"),
  ]);
  if (bError) fail("count breakdown", bError);
  const productNames = new Map(products.map((p) => [p.id, p.nameEn]));
  const dayOf = new Map((batches ?? []).map((b) => [b.id, b.day_number]));

  const lineIds = breakdown.map((b) => b.line_id);
  const { data: audit, error: aError } = await supabase
    .from("audit_log")
    .select("id, changed_at, changed_by, reason, row_id, old_values, new_values")
    .eq("table_name", "stock_count_lines")
    .in("row_id", lineIds.length ? lineIds : ["-"])
    .order("id", { ascending: false });
  if (aError) fail("audit log", aError);

  const names = await staffNames([
    row.counted_by!,
    ...audit.map((a) => a.changed_by).filter((id): id is string => !!id),
  ]);
  const productOfLine = new Map(breakdown.map((b) => [b.line_id, b.product_id]));
  const location = locations.find((l) => l.id === row.location_id);
  const summary = (await listCounts({ locationId: row.location_id!, limit: 500 })).find(
    (c) => c.id === countId,
  )!;

  const values = (v: unknown) => {
    const o = (v ?? {}) as { whole_cakes?: number; loose_pieces?: number };
    return { wholeCakes: o.whole_cakes ?? 0, loosePieces: o.loose_pieces ?? 0 };
  };

  return {
    summary: { ...summary, countedBy: names.get(row.counted_by!) ?? summary.countedBy },
    locationKind: location?.kind ?? "branch",
    lines: breakdown.map((b) => ({
      lineId: b.line_id,
      productId: b.product_id,
      productName: productNames.get(b.product_id) ?? "",
      dayNumber: b.batch_id ? (dayOf.get(b.batch_id) ?? null) : null,
      piecesPerCake: b.pieces_per_cake,
      wholeCakes: b.whole_cakes,
      loosePieces: b.loose_pieces,
      counted: b.counted_qty,
      prev: b.prev_qty,
      in: b.in_qty,
      out: b.out_qty,
      waste: b.waste_qty,
      other: b.other_qty,
      adjustment: b.adjustment_qty,
      expected: b.expected_qty,
      ocr: {
        wholeCakes: b.ocr_whole_cakes,
        loosePieces: b.ocr_loose_pieces,
        wholeConfidence: b.ocr_whole_confidence === null ? null : Number(b.ocr_whole_confidence),
        piecesConfidence: b.ocr_pieces_confidence === null ? null : Number(b.ocr_pieces_confidence),
      },
    })),
    audit: audit.map((a) => ({
      id: a.id,
      changedAt: a.changed_at,
      changedBy: (a.changed_by && names.get(a.changed_by)) || "",
      reason: a.reason,
      productName: productNames.get(productOfLine.get(a.row_id) ?? "") ?? "",
      before: values(a.old_values),
      after: values(a.new_values),
    })),
    photoUrl: row.photo_path ? await signedPhotoUrl("count-photos", row.photo_path) : null,
  };
}

// ─── التالف ──────────────────────────────────────────────────────────

export interface WasteRow {
  id: string;
  occurredAt: string;
  locationId: string;
  locationName: string;
  productName: string;
  piecesPerCake: number | null;
  enteredUnit: "cake" | "piece";
  enteredQty: number;
  qtyPieces: number;
  reason: "expired" | "broken" | "other";
  note: string | null;
  photoPath: string | null;
  recordedBy: string;
  dayNumber: number | null;
}

export async function listWaste(
  range: Range,
): Promise<{ from: string; rows: WasteRow[]; dispatchedPieces: number }> {
  const supabase = await db();
  const today = businessDate(new Date());
  const from = rangeStart(range, today);
  const fromInstant = new Date(`${from}T00:00:00+03:00`).toISOString();

  const [{ data, error }, locations, products, { data: dispatched }] = await Promise.all([
    supabase
      .from("waste_records")
      .select(
        "id, occurred_at, location_id, product_id, entered_unit, entered_qty, qty_pieces, pieces_per_cake_snapshot, reason, reason_note, photo_path, recorded_by, batch:batches(day_number)",
      )
      .gte("occurred_at", fromInstant)
      .order("occurred_at", { ascending: false }),
    listReportLocations(),
    listReportProducts(),
    // اللي طلع من المصنع للفروع بنفس الفترة (أساس نسبة التالف)
    supabase
      .from("stock_movements")
      .select("qty_pieces")
      .eq("movement_type", "receipt_in")
      .gte("occurred_at", fromInstant),
  ]);
  if (error) fail("waste", error);
  const names = await staffNames(data.map((w) => w.recorded_by));
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  const productNames = new Map(products.map((p) => [p.id, p.nameEn]));
  return {
    from,
    dispatchedPieces: (dispatched ?? []).reduce((s, m) => s + m.qty_pieces, 0),
    rows: data.map((w) => ({
      id: w.id,
      occurredAt: w.occurred_at,
      locationId: w.location_id,
      locationName: locationNames.get(w.location_id) ?? "",
      productName: productNames.get(w.product_id) ?? "",
      piecesPerCake: w.pieces_per_cake_snapshot,
      enteredUnit: w.entered_unit,
      enteredQty: w.entered_qty,
      qtyPieces: w.qty_pieces ?? 0,
      reason: w.reason,
      note: w.reason_note,
      photoPath: w.photo_path,
      recordedBy: names.get(w.recorded_by) ?? "",
      dayNumber: w.batch?.day_number ?? null,
    })),
  };
}

// ─── النظرة العامة ───────────────────────────────────────────────────

export interface SlotToday {
  scheduleId: string;
  locationId: string;
  timeOfDay: string;
  slotAt: string;
  status: "done" | "late" | "due" | "upcoming";
}

export async function slotsToday(): Promise<SlotToday[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("v_count_slots_today")
    .select("schedule_id, location_id, time_of_day, slot_at, status")
    .order("time_of_day");
  if (error) fail("count slots", error);
  return data.map((s) => ({
    scheduleId: s.schedule_id!,
    locationId: s.location_id!,
    timeOfDay: s.time_of_day!,
    slotAt: s.slot_at!,
    status: s.status as SlotToday["status"],
  }));
}

export interface FactoryBatchAlert {
  productName: string;
  dayNumber: number;
  qty: number;
  piecesPerCake: number | null;
  isExpired: boolean;
}

export async function factoryBatchAlerts(): Promise<FactoryBatchAlert[]> {
  const supabase = await db();
  const [{ data, error }, products] = await Promise.all([
    supabase
      .from("v_factory_batches")
      .select("product_id, day_number, qty_pieces, is_last_day, is_expired")
      .or("is_last_day.eq.true,is_expired.eq.true")
      .gt("qty_pieces", 0),
    listReportProducts(),
  ]);
  if (error) fail("batches", error);
  const byId = new Map(products.map((p) => [p.id, p]));
  return data.map((b) => ({
    productName: byId.get(b.product_id!)?.nameEn ?? "",
    dayNumber: b.day_number!,
    qty: b.qty_pieces!,
    piecesPerCake: byId.get(b.product_id!)?.piecesPerCake ?? null,
    isExpired: b.is_expired!,
  }));
}

/** آخر جرد مؤكد بكل موقع. */
export async function lastCountByLocation(): Promise<Map<string, CountListRow>> {
  const counts = await listCounts({ limit: 200 });
  const map = new Map<string, CountListRow>();
  for (const c of counts) if (!map.has(c.locationId)) map.set(c.locationId, c);
  return map;
}

export function yesterdayOf(todayIso: string): string {
  return addDays(todayIso, -1);
}
