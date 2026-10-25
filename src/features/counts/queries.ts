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
      .select("schedule_id, time_of_day, status")
      .eq("location_id", loc.id)
      .order("time_of_day"),
    supabase.from("app_settings").select("photo_count_enabled, factory_shelf_life_days").single(),
  ]);
  if (slots.error) throw new Error(`Could not load count slots: ${slots.error.message}`);
  if (settings.error) throw new Error(`Could not load settings: ${settings.error.message}`);

  const open = slots.data.filter((s) => s.status === "due" || s.status === "late");
  // الأقرب (آخر موعد وصل وقته)
  const current = open.at(-1);

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

export async function listCountProducts(kind: "cake" | "packaging" = "cake"): Promise<CountProduct[]> {
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
}

/** الدفعات اللي إلها ستوك بالمصنع، بدون الكميات (الجرد أعمى). */
export async function listFactoryBatches(locationId: string): Promise<FactoryBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_factory_batches")
    .select("product_id, production_date, day_number, is_last_day, is_expired")
    .eq("location_id", locationId)
    .order("production_date");
  if (error) throw new Error(`Could not load batches: ${error.message}`);
  return data.map((b) => ({
    productId: b.product_id!,
    productionDate: b.production_date!,
    dayNumber: b.day_number as DayNumber,
    isLastDay: b.is_last_day ?? false,
    isExpired: b.is_expired ?? false,
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
