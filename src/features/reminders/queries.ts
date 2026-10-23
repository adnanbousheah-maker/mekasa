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
