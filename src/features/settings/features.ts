import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface Features {
  // المهام المتكررة (مخفية لحد ما IT يشغّلها)
  tasks: boolean;
  // فترة المعاينة: زر التصفير شغّال
  previewMode: boolean;
}

/** مفاتيح IT. لازم بعد قراءة الجلسة (requireStaff بينادي connection). */
export const getFeatures = cache(async (): Promise<Features> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("feature_tasks, preview_mode").maybeSingle();
  return { tasks: data?.feature_tasks ?? false, previewMode: data?.preview_mode ?? true };
});
