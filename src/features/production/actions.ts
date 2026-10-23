"use server";

import { refresh } from "next/cache";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { productionSchema, type ProductionInput } from "./logic";

export type ProductionResult = { status: "error"; message: string } | { status: "done" };

/** إنتاج اليوم بدفعة اليوم (record_production). */
export async function recordProductionAction(input: ProductionInput): Promise<ProductionResult> {
  await requireStaff();
  const parsed = productionSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_production", {
    p_lines: parsed.data.lines.map((l) => ({
      product_id: l.productId,
      whole_cakes: l.wholeCakes,
      loose_pieces: l.loosePieces,
    })) as Json,
    p_note: parsed.data.note || undefined,
  });
  if (error) {
    console.error("recordProduction", error);
    return {
      status: "error",
      message: error.code === "42501" ? "تسجيل الإنتاج لأمين المستودع" : "ما انحفظ الإنتاج. جرب كمان مرة.",
    };
  }
  refresh();
  return { status: "done" };
}
