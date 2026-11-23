import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface Features {
  // المهام المتكررة (مخفية لحد ما IT يشغّلها)
  tasks: boolean;
  // فترة المعاينة: زر التصفير شغّال
  previewMode: boolean;
  // فترة التجربة: زر "تم إخراج الطلبية" لمسؤول المصنع
  requestMarkOut: boolean;
}

/** مفاتيح IT. لازم بعد قراءة الجلسة (requireStaff بينادي connection). */
export const getFeatures = cache(async (): Promise<Features> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("feature_tasks, preview_mode, feature_request_mark_out")
    .maybeSingle();
  return {
    tasks: data?.feature_tasks ?? false,
    previewMode: data?.preview_mode ?? true,
    requestMarkOut: data?.feature_request_mark_out ?? false,
  };
});
