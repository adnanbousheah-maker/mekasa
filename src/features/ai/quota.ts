import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// حد استعمال Claude لكل موظف بالساعة، مشان ما حدا يخلّص الميزانية (قراءة الفورم والمساعد).
export const AI_HOURLY_LIMIT = { count_ocr: 15, assistant: 40 } as const;

/** true إذا الموظف لسا تحت الحد بآخر ساعة (من ai_usage_log). */
export async function underAiQuota(staffId: string, feature: keyof typeof AI_HOURLY_LIMIT): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId)
    .eq("feature", feature)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if (error) {
    console.error("ai quota", error);
    return true;
  }
  return (count ?? 0) < AI_HOURLY_LIMIT[feature];
}
