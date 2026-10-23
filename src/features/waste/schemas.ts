import { z } from "zod";
import { countWord } from "@/lib/units";

export const WASTE_REASONS = ["expired", "broken", "other"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  expired: "انتهت",
  broken: "انكسرت",
  other: "غيره",
};

export const wasteSchema = z
  .object({
    productId: z.uuid("اختار الصنف"),
    unit: z.enum(["cake", "piece"]),
    qty: z.number().int().min(1, "الكمية لازم تكون 1 على الأقل").max(999, "الكمية كبيرة كثير"),
    reason: z.enum(WASTE_REASONS, "اختار السبب"),
    note: z.string().trim().max(200, "الملاحظة طويلة كثير").default(""),
    productionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    photoPath: z.string().min(1).max(300).nullable().default(null),
  })
  .refine((w) => w.reason !== "other" || w.note.length > 0, {
    message: "اكتب شو صار",
    path: ["note"],
  });

export type WasteInput = z.input<typeof wasteSchema>;

/** نص زر التسجيل: "سجّل 2 كيكة تالف". */
export function wasteSubmitLabel(qty: number, unit: "cake" | "piece"): string {
  return `سجّل ${qty} ${countWord(qty, unit)} تالف`;
}
