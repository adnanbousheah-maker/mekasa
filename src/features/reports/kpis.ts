import "server-only";
import { requireManager, requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "./period";

// تقارير الإدارة بالكميات (report_locations / report_products / report_daily).

export interface LocationKpis {
  id: string;
  name: string;
  kind: "factory" | "branch";
  consumedCakes: number;
  consumedLoose: number;
  wasteCakes: number;
  wasteLoose: number;
  receivedCakes: number;
  producedCakes: number;
  dispatchedCakes: number;
  countsExpected: number;
  countsDone: number;
  countsOnTime: number;
  receiptLines: number;
  receiptDiffs: number;
  impossibleLines: number;
}

export interface ProductKpis {
  id: string;
  name: string;
  piecesPerCake: number | null;
  consumed: number;
  waste: number;
  produced: number;
  received: number;
}

export interface DailyPoint {
  day: string;
  locationId: string;
  consumedCakes: number;
  wasteCakes: number;
}

export interface ManagementReport {
  period: Period;
  locations: LocationKpis[];
  previous: LocationKpis[];
  products: ProductKpis[];
  previousProducts: ProductKpis[];
  daily: DailyPoint[];
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function locationsFor(
  supabase: Db,
  from: string,
  to: string,
  names: Map<string, { name: string; kind: "factory" | "branch" }>,
) {
  const { data, error } = await supabase.rpc("report_locations", { p_from: from, p_to: to });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  return data
    .filter((r) => names.has(r.location_id))
    .map((r) => ({
      id: r.location_id,
      name: names.get(r.location_id)!.name,
      kind: names.get(r.location_id)!.kind,
      consumedCakes: Number(r.consumed_cakes),
      consumedLoose: r.consumed_loose,
      wasteCakes: Number(r.waste_cakes),
      wasteLoose: r.waste_loose,
      receivedCakes: Number(r.received_cakes),
      producedCakes: Number(r.produced_cakes),
      dispatchedCakes: Number(r.dispatched_cakes),
      countsExpected: r.counts_expected,
      countsDone: r.counts_done,
      countsOnTime: r.counts_on_time,
      receiptLines: r.receipt_lines,
      receiptDiffs: r.receipt_diffs,
      impossibleLines: r.impossible_lines,
    }));
}

async function productsFor(
  supabase: Db,
  from: string,
  to: string,
  products: Map<string, { name: string; ppc: number | null }>,
) {
  const { data, error } = await supabase.rpc("report_products", { p_from: from, p_to: to });
  if (error) throw new Error(`Could not load the product report: ${error.message}`);
  return data
    .filter((r) => products.has(r.product_id))
    .map((r) => ({
      id: r.product_id,
      name: products.get(r.product_id)!.name,
      piecesPerCake: products.get(r.product_id)!.ppc,
      consumed: r.consumed_pieces,
      waste: r.waste_pieces,
      produced: r.produced_pieces,
      received: r.received_pieces,
    }));
}

/** التقرير للفترة، ونفس الأرقام للفترة اللي قبلها للمقارنة. */
export async function managementReport(period: Period): Promise<ManagementReport> {
  await requireManager();
  return buildReport(period, null);
}

export interface TaskKpis {
  locationId: string;
  expected: number;
  done: number;
  onTime: number;
}

async function tasksFor(supabase: Db, from: string, to: string): Promise<TaskKpis[]> {
  const { data, error } = await supabase.rpc("report_tasks", { p_from: from, p_to: to });
  if (error) throw new Error(`Could not load the task report: ${error.message}`);
  return data.map((r) => ({
    locationId: r.location_id,
    expected: r.expected,
    done: r.done,
    onTime: r.on_time,
  }));
}

/** الالتزام بالمهام المتكررة لكل موقع (RLS بتحدد المواقع)، والفترة اللي قبل. */
export async function tasksReport(period: Period): Promise<{ now: TaskKpis[]; before: TaskKpis[] }> {
  await requireStaff();
  const supabase = await createClient();
  const [now, before] = await Promise.all([
    tasksFor(supabase, period.from, period.to),
    tasksFor(supabase, period.previous.from, period.previous.to),
  ]);
  return { now, before };
}

/** تقرير فرع مسؤول الفرع (نفس الأرقام، لفرعه بس). null إذا مش مسؤول فرع. */
export async function branchReport(period: Period): Promise<ManagementReport | null> {
  const staff = await requireStaff();
  if (!staff.roles.includes("branch_manager") || staff.location?.kind !== "branch") return null;
  return buildReport(period, staff.location.id);
}

// الصلاحية عند اللي بينادي (managementReport / branchReport)
async function buildReport(period: Period, onlyLocation: string | null): Promise<ManagementReport> {
  const supabase = await createClient();
  const [locationRows, productRows] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, kind")
      .in("kind", ["factory", "branch"])
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("v_products")
      .select("id, name_en, effective_pieces_per_cake")
      .eq("kind", "cake")
      .order("sort_order"),
  ]);
  if (locationRows.error) throw new Error(`Could not load locations: ${locationRows.error.message}`);
  if (productRows.error) throw new Error(`Could not load products: ${productRows.error.message}`);
  const locations = locationRows.data.filter((l) => !onlyLocation || l.id === onlyLocation);
  const names = new Map(locations.map((l) => [l.id, { name: l.name, kind: l.kind as "factory" | "branch" }]));
  const productInfo = new Map(
    productRows.data.map((p) => [p.id!, { name: p.name_en!, ppc: p.effective_pieces_per_cake }]),
  );

  const [current, previous, currentProducts, previousProducts, daily] = await Promise.all([
    locationsFor(supabase, period.from, period.to, names),
    locationsFor(supabase, period.previous.from, period.previous.to, names),
    productsFor(supabase, period.from, period.to, productInfo),
    productsFor(supabase, period.previous.from, period.previous.to, productInfo),
    supabase.rpc("report_daily", { p_from: period.from, p_to: period.to }),
  ]);
  if (daily.error) throw new Error(`Could not load the daily report: ${daily.error.message}`);
  return {
    period,
    locations: current,
    previous,
    products: currentProducts,
    previousProducts,
    daily: daily.data
      .filter((d) => names.has(d.location_id))
      .map((d) => ({
        day: d.day,
        locationId: d.location_id,
        consumedCakes: Number(d.consumed_cakes),
        wasteCakes: Number(d.waste_cakes),
      })),
  };
}

/** مجموع الأرقام لكل المواقع. */
export function totals(rows: LocationKpis[]) {
  const sum = (f: (r: LocationKpis) => number, kind?: "branch" | "factory") =>
    Math.round(rows.filter((r) => !kind || r.kind === kind).reduce((s, r) => s + f(r), 0) * 10) / 10;
  return {
    consumed: sum((r) => r.consumedCakes, "branch"),
    waste: sum((r) => r.wasteCakes),
    branchWaste: sum((r) => r.wasteCakes, "branch"),
    received: sum((r) => r.receivedCakes, "branch"),
    produced: sum((r) => r.producedCakes, "factory"),
    dispatched: sum((r) => r.dispatchedCakes, "factory"),
    countsExpected: sum((r) => r.countsExpected),
    countsDone: sum((r) => r.countsDone),
    countsOnTime: sum((r) => r.countsOnTime),
    receiptLines: sum((r) => r.receiptLines),
    receiptDiffs: sum((r) => r.receiptDiffs),
    impossible: sum((r) => r.impossibleLines),
  };
}
