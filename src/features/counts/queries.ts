import "server-only";
import { requireStaff, type CurrentStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { DayNumber } from "@/lib/day-number";

export interface CountProduct {
  id: string;
  nameEn: string;
  nameAr: string | null;
  // null = قطع بس
  piecesPerCake: number | null;
  // مدة الحياة بالمصنع (أكثر من 7 = الدفعة بالتاريخ)
  shelfLifeDays: number;
}

export interface CountSlot {
  scheduleId: string;
  timeOfDay: string;
  status: "done" | "late" | "due" | "upcoming";
}

export interface CountContext {
  staff: CurrentStaff;
  location: { id: string; name: string; kind: "branch" | "factory" };
  // الموعد اللي وقته هلا (أو متأخر) ولسا ما انجرد. null = جرد خارج المواعيد
  slot: CountSlot | null;
  photoCountEnabled: boolean;
  shelfLifeDays: number;
}

/** الموظف وموقعه وموعد الجرد الحالي. null إذا الموظف ما بيجرد (مثلاً الإخراج بس). */
export async function getCountContext(): Promise<CountContext | null> {
  const staff = await requireStaff();
  const loc = staff.location;
  if (!loc || (loc.kind !== "branch" && loc.kind !== "factory")) return null;
  const canCount =
    loc.kind === "branch" ? staff.roles.includes("branch_staff") : staff.roles.includes("storekeeper");
  if (!canCount) return null;

  const supabase = await createClient();
  const [slots, settings] = await Promise.all([
    supabase
      .from("v_count_slots_today")
      .select("schedule_id, time_of_day, slot_at, status")
      .eq("location_id", loc.id)
      .order("slot_at"),
    supabase.from("app_settings").select("photo_count_enabled, factory_shelf_life_days").single(),
  ]);
  if (slots.error) throw new Error(`Could not load count slots: ${slots.error.message}`);
  if (settings.error) throw new Error(`Could not load settings: ${settings.error.message}`);

  const open = slots.data.filter((s) => s.status === "due" || s.status === "late");
  // الأقرب (آخر موعد وصل وقته)، أو موعد جاي خلال ساعة: اللي بيجرد بدري ما بيطلع "متأخر" بعدين
  const soon = slots.data.find(
    (s) => s.status === "upcoming" && new Date(s.slot_at!).getTime() - Date.now() <= 60 * 60_000,
  );
  const current = open.at(-1) ?? soon;

  return {
    staff,
    location: { id: loc.id, name: loc.name, kind: loc.kind },
    slot: current
      ? {
          scheduleId: current.schedule_id!,
          timeOfDay: current.time_of_day!,
          status: current.status as CountSlot["status"],
        }
      : null,
    photoCountEnabled: settings.data.photo_count_enabled,
    shelfLifeDays: settings.data.factory_shelf_life_days,
  };
}

export async function listCountProducts(
  kind: "cake" | "packaging" | "sauce" = "cake",
): Promise<CountProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_products")
    .select("id, name_en, name_ar, effective_pieces_per_cake, effective_shelf_life_days")
    .eq("is_active", true)
    .eq("kind", kind)
    .order("sort_order");
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return data.map((p) => ({
    id: p.id!,
    nameEn: p.name_en!,
    nameAr: p.name_ar,
    piecesPerCake: p.effective_pieces_per_cake,
    shelfLifeDays: p.effective_shelf_life_days ?? 7,
  }));
}

export interface FactoryBatch {
  productId: string;
  productionDate: string;
  dayNumber: DayNumber;
  isLastDay: boolean;
  isExpired: boolean;
  frozen: boolean;
}

/** الدفعات اللي إلها ستوك بالمصنع، بدون الكميات (الجرد أعمى). */
export async function listFactoryBatches(locationId: string): Promise<FactoryBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_factory_batches")
    .select("product_id, production_date, day_number, is_last_day, is_expired, is_frozen")
    .eq("location_id", locationId)
    .order("production_date");
  if (error) throw new Error(`Could not load batches: ${error.message}`);
  return data.map((b) => ({
    productId: b.product_id!,
    productionDate: b.production_date!,
    dayNumber: b.day_number as DayNumber,
    isLastDay: b.is_last_day ?? false,
    isExpired: b.is_expired ?? false,
    frozen: b.is_frozen ?? false,
  }));
}

export interface CountSummary {
  id: string;
  locationName: string;
  scheduleTime: string | null;
  confirmedAt: string;
  productCount: number;
  cakes: number;
  pieces: number;
}

/** ملخص شاشة "تم الجرد". RLS بتخلي الموظف يشوف جرد موقعه بس. */
export async function getCountSummary(countId: string): Promise<CountSummary | null> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .select(
      "id, confirmed_at, location:locations(name), schedule:count_schedules(time_of_day), stock_count_lines(product_id, whole_cakes, loose_pieces)",
    )
    .eq("id", countId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the count: ${error.message}`);
  if (!data || !data.confirmed_at) return null;

  const counted = data.stock_count_lines.filter((l) => l.whole_cakes + l.loose_pieces > 0);
  return {
    id: data.id,
    locationName: data.location.name,
    scheduleTime: data.schedule?.time_of_day ?? null,
    confirmedAt: data.confirmed_at,
    productCount: new Set(counted.map((l) => l.product_id)).size,
    cakes: data.stock_count_lines.reduce((s, l) => s + l.whole_cakes, 0),
    pieces: data.stock_count_lines.reduce((s, l) => s + l.loose_pieces, 0),
  };
}

/** ربع ساعة بعد التأكيد بيقدر الموظف يعدّل جرده (نفس private.count_edit_minutes). */
export const COUNT_EDIT_MINUTES = 15;

/** كم دقيقة ضايل لتعديل الجرد (0 = خلص). */
export function countEditMinutesLeft(confirmedAt: string, now: Date): number {
  const left = COUNT_EDIT_MINUTES * 60_000 - (now.getTime() - new Date(confirmedAt).getTime());
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

export interface EditableCount {
  id: string;
  locationId: string;
  locationName: string;
  confirmedAt: string;
  // آخر جرد مؤكد بالموقع (بس هو بيتعدّل)
  isLatest: boolean;
  lines: {
    lineId: string;
    productName: string;
    piecesPerCake: number | null;
    productionDate: string | null;
    frozen: boolean;
    wholeCakes: number;
    loosePieces: number;
  }[];
}

/** جرد للتعديل: أسطره بأسماء الأصناف (وتاريخ الدفعة بالمصنع). RLS بتحدد مين بيشوفه. */
export async function getCountForEdit(countId: string): Promise<EditableCount | null> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .select(
      "id, location_id, started_at, confirmed_at, status, location:locations(name), stock_count_lines(id, whole_cakes, loose_pieces, pieces_per_cake_snapshot, product:products(name_en, sort_order), batch:batches(production_date, is_frozen))",
    )
    .eq("id", countId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the count: ${error.message}`);
  if (!data || data.status !== "confirmed" || !data.confirmed_at) return null;
  const { count: later } = await supabase
    .from("stock_counts")
    .select("id", { count: "exact", head: true })
    .eq("location_id", data.location_id)
    .eq("status", "confirmed")
    .gt("started_at", data.started_at);
  return {
    id: data.id,
    locationId: data.location_id,
    locationName: data.location.name,
    confirmedAt: data.confirmed_at,
    isLatest: (later ?? 0) === 0,
    lines: data.stock_count_lines
      .map((l) => ({
        lineId: l.id,
        productName: l.product.name_en,
        sortOrder: l.product.sort_order ?? 0,
        piecesPerCake: l.pieces_per_cake_snapshot,
        productionDate: l.batch?.production_date ?? null,
        frozen: l.batch?.is_frozen ?? false,
        wholeCakes: l.whole_cakes,
        loosePieces: l.loose_pieces,
      }))
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || (a.productionDate ?? "").localeCompare(b.productionDate ?? ""),
      )
      .map((l) => ({
        lineId: l.lineId,
        productName: l.productName,
        piecesPerCake: l.piecesPerCake,
        productionDate: l.productionDate,
        frozen: l.frozen,
        wholeCakes: l.wholeCakes,
        loosePieces: l.loosePieces,
      })),
  };
}

/** آخر جرد مؤكد بموقع الموظف إذا لسا بينعدّل (للرابط بشاشة الجرد). */
export async function editableLatestCount(
  locationId: string,
  now: Date,
): Promise<{ id: string; left: number } | null> {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_counts")
    .select("id, confirmed_at")
    .eq("location_id", locationId)
    .eq("status", "confirmed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.confirmed_at) return null;
  const left = countEditMinutesLeft(data.confirmed_at, now);
  return left > 0 ? { id: data.id, left } : null;
}
