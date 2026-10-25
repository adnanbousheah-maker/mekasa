"use server";

import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { wasteSchema, type WasteInput } from "./schemas";

export type WasteResult = { status: "error"; message: string } | { status: "done" };

/** التالف بموقع الموظف: السجل وحركته بدالة record_waste. */
export async function recordWasteAction(input: WasteInput): Promise<WasteResult> {
  const staff = await requireStaff();
  if (!staff.location) return { status: "error", message: "حسابك مش مربوط بموقع" };

  const parsed = wasteSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };
  const w = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_waste", {
    p_location_id: staff.location.id,
    p_product_id: w.productId,
    p_unit: w.unit,
    p_qty: w.qty,
    p_reason: w.reason,
    p_note: w.note || undefined,
    p_production_date: w.productionDate ?? undefined,
    p_photo_path: w.photoPath ?? undefined,
  });
  if (error) {
    console.error("recordWaste", error);
    const message =
      error.code === "23514"
        ? "في معلومة ناقصة أو مش منطقية"
        : error.code === "42501"
          ? "ما إلك صلاحية تسجل تالف هون"
          : "ما انسجل التالف. جرب كمان مرة.";
    return { status: "error", message };
  }
  // بدون refresh(): الفورم بينعمل من جديد مع كل رسم للصفحة (key)، فالـ refresh كان يمسح
  // رسالة "انسجل التالف" أحياناً والموظف ممكن يسجل مرتين. باقي الصفحات بتجيب بياناتها لما ينفتحوا.
  return { status: "done" };
}
