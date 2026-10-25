import "server-only";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { SellMode } from "./schemas";

export type AppSettings = Database["public"]["Tables"]["app_settings"]["Row"];

export interface ProductRow {
  id: string;
  nameEn: string;
  nameAr: string | null;
  sellMode: SellMode;
  piecesPerCake: number | null;
  isActive: boolean;
}

export interface ScheduleLocation {
  id: string;
  name: string;
  kind: "factory" | "branch";
  times: { id: string; timeOfDay: string }[];
}

export async function getSettings(): Promise<AppSettings> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("*").single();
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  return data;
}

/** كل الأصناف، حتى الموقوفة، بترتيب المنيو. */
export async function listProducts(kind: "cake" | "packaging" = "cake"): Promise<ProductRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name_en, name_ar, sell_mode, pieces_per_cake, is_active")
    .eq("kind", kind)
    .order("sort_order")
    .order("name_en");
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return data.map((p) => ({
    id: p.id,
    nameEn: p.name_en,
    nameAr: p.name_ar,
    sellMode: p.sell_mode,
    piecesPerCake: p.pieces_per_cake,
    isActive: p.is_active,
  }));
}

/** المصنع والفروع مع مواعيدهم الفعّالة (المواعيد ما بتنحذف، بتنوقف). */
export async function listScheduleLocations(): Promise<ScheduleLocation[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, kind, count_schedules(id, time_of_day, is_active)")
    .in("kind", ["factory", "branch"])
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Could not load schedules: ${error.message}`);
  return data.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind as ScheduleLocation["kind"],
    times: l.count_schedules
      .filter((s) => s.is_active)
      .sort((a, b) => a.time_of_day.localeCompare(b.time_of_day))
      .map((s) => ({ id: s.id, timeOfDay: s.time_of_day })),
  }));
}
