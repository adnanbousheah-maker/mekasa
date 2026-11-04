import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface OpenSlot {
  timeOfDay: string;
  slotAt: string;
  status: "due" | "late";
}

/** موعد جرد وصل وقته (أو متأخر) ولسا ما انعمل، لموقع الموظف (RLS). */
export async function getOpenSlot(locationId: string): Promise<OpenSlot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_count_slots_today")
    .select("time_of_day, slot_at, status")
    .eq("location_id", locationId)
    .in("status", ["due", "late"])
    .order("time_of_day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load count slots: ${error.message}`);
  return data
    ? { timeOfDay: data.time_of_day!, slotAt: data.slot_at!, status: data.status as OpenSlot["status"] }
    : null;
}

export interface MonthlyCountDue {
  id: string;
  scope: "stock" | "raw";
  locationKind: string;
  locationName: string;
  timeOfDay: string;
  done: boolean;
}

/** جرد آخر الشهر اليوم (بآخر يوم بالشهر بس) اللي على هالموظف حسب أدواره. */
export async function getMonthlyCountsDue(roles: readonly string[]): Promise<MonthlyCountDue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_monthly_counts_today")
    .select("id, location_id, scope, time_of_day, done")
    .order("time_of_day");
  if (error) throw new Error(`Could not load monthly counts: ${error.message}`);
  if (!data?.length) return [];
  const { data: places, error: placesError } = await supabase
    .from("locations")
    .select("id, name, kind")
    .in("id", [...new Set(data.map((m) => m.location_id!))]);
  if (placesError) throw new Error(`Could not load monthly count places: ${placesError.message}`);
  const byId = new Map((places ?? []).map((l) => [l.id, l]));
  return data.flatMap((m) => {
    const place = byId.get(m.location_id!);
    if (!place) return [];
    const scope = m.scope === "raw" ? "raw" : "stock";
    const mine =
      scope === "raw" || place.kind === "factory"
        ? roles.includes("storekeeper")
        : place.kind === "packaging"
          ? roles.includes("packaging_keeper")
          : roles.includes("branch_staff");
    if (!mine) return [];
    return [
      {
        id: m.id!,
        scope,
        locationKind: place.kind,
        locationName: place.name,
        timeOfDay: m.time_of_day!,
        done: m.done ?? false,
      } satisfies MonthlyCountDue,
    ];
  });
}
