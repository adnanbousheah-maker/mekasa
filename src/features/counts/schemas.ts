import { z } from "zod";

// أكبر رقم ممكن بخانة وحدة. أكبر من هيك غالباً غلطة إصبع (أو قراءة غلط للصورة).
export const MAX_COUNT_VALUE = 999;

const countValue = z.number().int().min(0).max(MAX_COUNT_VALUE);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const confidence = z.number().min(0).max(1);

export const countLineSchema = z.object({
  productId: z.uuid(),
  // المصنع بس: تاريخ إنتاج الدفعة
  productionDate: isoDate.optional(),
  wholeCakes: countValue,
  loosePieces: countValue,
  // الجرد بالصورة: شو قرأ Claude، وثقته
  ocr: z
    .object({
      wholeCakes: countValue.nullable(),
      loosePieces: countValue.nullable(),
      wholeConfidence: confidence.nullable(),
      piecesConfidence: confidence.nullable(),
    })
    .optional(),
});

export type CountLine = z.infer<typeof countLineSchema>;

export const submitCountSchema = z.object({
  scheduleId: z.uuid().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  lines: z.array(countLineSchema).max(400),
  method: z.enum(["manual", "photo"]).default("manual"),
  photoPath: z.string().min(1).max(300).nullable().default(null),
  formVersionId: z.uuid().nullable().default(null),
});

export type SubmitCountInput = z.input<typeof submitCountSchema>;

/** صيغة الأسطر اللي بتستناها submit_count بقاعدة البيانات. */
export function toRpcLines(lines: CountLine[]) {
  return lines.map((l) => ({
    product_id: l.productId,
    production_date: l.productionDate ?? null,
    whole_cakes: l.wholeCakes,
    loose_pieces: l.loosePieces,
    ocr_whole_cakes: l.ocr?.wholeCakes ?? null,
    ocr_loose_pieces: l.ocr?.loosePieces ?? null,
    ocr_whole_confidence: l.ocr?.wholeConfidence ?? null,
    ocr_pieces_confidence: l.ocr?.piecesConfidence ?? null,
  }));
}

/** ملخص أسفل الشاشة: "20 صنف · 33 كيكة · 86 قطعة". */
export function countTotals(lines: Pick<CountLine, "wholeCakes" | "loosePieces">[]) {
  return lines.reduce((t, l) => ({ cakes: t.cakes + l.wholeCakes, pieces: t.pieces + l.loosePieces }), {
    cakes: 0,
    pieces: 0,
  });
}

export const correctionSchema = z.object({
  lineId: z.uuid(),
  wholeCakes: countValue,
  loosePieces: countValue,
  reason: z.string().trim().min(3, "اكتب سبب التعديل (3 أحرف على الأقل)").max(300, "السبب طويل كثير"),
});
