import { z } from "zod";

export const productionSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        wholeCakes: z.number().int().min(0).max(999),
        loosePieces: z.number().int().min(0).max(9999),
        // المفرّز دفعة لحالها، صلاحيتها 30 يوم
        frozen: z.boolean().default(false),
      }),
    )
    .max(200)
    .transform((lines) => lines.filter((l) => l.wholeCakes + l.loosePieces > 0))
    .refine((lines) => lines.length > 0, "ما سجلت ولا صنف"),
  note: z.string().trim().max(300).default(""),
});

export type ProductionInput = z.input<typeof productionSchema>;

/** سطر طازة وسطر مفرّز من نفس الكمية: frozen من total (الباقي طازة). */
export function splitFrozen(total: number, frozen: number): { fresh: number; frozen: number } {
  const f = Math.max(0, Math.min(total, frozen));
  return { fresh: total - f, frozen: f };
}

/** "سجلت اليوم الساعة 7:30: 24 كيكة" — مجموع تسجيلات اليوم بالكيكات والقطع. */
export function productionTotals(
  entries: { production_lines: { whole_cakes: number; loose_pieces: number }[] }[],
) {
  return entries
    .flatMap((e) => e.production_lines)
    .reduce((t, l) => ({ cakes: t.cakes + l.whole_cakes, pieces: t.pieces + l.loose_pieces }), {
      cakes: 0,
      pieces: 0,
    });
}
