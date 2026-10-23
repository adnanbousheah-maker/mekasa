import { z } from "zod";
import { countWord } from "@/lib/units";

// ─── الكمية المقترحة: الحد المطلوب − الموجود ─────────────────────────

/** الاقتراح بكيكات كاملة (لفوق) للأصناف اللي إلها كيكة، وبالقطع للأصناف اللي قطع بس. */
export function suggestQuantity(
  parPieces: number | undefined,
  stockPieces: number,
  piecesPerCake: number | null,
): { wholeCakes: number; loosePieces: number; suggestedPieces: number } {
  const missing = Math.max(0, (parPieces ?? 0) - Math.max(0, stockPieces));
  if (missing === 0) return { wholeCakes: 0, loosePieces: 0, suggestedPieces: 0 };
  if (piecesPerCake === null) return { wholeCakes: 0, loosePieces: missing, suggestedPieces: missing };
  return { wholeCakes: Math.ceil(missing / piecesPerCake), loosePieces: 0, suggestedPieces: missing };
}

// ─── FEFO: من الأقدم أول ─────────────────────────────────────────────

export interface BatchStock {
  productionDate: string;
  available: number;
  expired?: boolean;
}

export interface Allocation {
  allocations: { productionDate: string; qty: number }[];
  short: number;
  // أخذنا من دفعة أحدث وفي دفعة أقدم (مش منتهية) ضل فيها
  override: boolean;
}

/**
 * توزيع الكمية على الدفعات: من الدفعة اللي اختارها الموظف أول (إذا اختار)، وبعدين الأقدم فالأحدث.
 * المنتهية ما بتنحسب. نفس منطق create_dispatch بقاعدة البيانات، للعرض قبل التأكيد.
 */
export function fefoAllocate(batches: BatchStock[], qty: number, firstDate?: string | null): Allocation {
  const usable = batches
    .filter((b) => !b.expired && b.available > 0)
    .sort((a, b) => a.productionDate.localeCompare(b.productionDate));
  const order = firstDate
    ? [
        ...usable.filter((b) => b.productionDate === firstDate),
        ...usable.filter((b) => b.productionDate !== firstDate),
      ]
    : usable;

  let left = qty;
  const allocations: Allocation["allocations"] = [];
  for (const b of order) {
    if (left <= 0) break;
    const take = Math.min(left, b.available);
    allocations.push({ productionDate: b.productionDate, qty: take });
    left -= take;
  }
  const taken = new Map(allocations.map((a) => [a.productionDate, a.qty]));
  const override = allocations.some((a) =>
    usable.some(
      (older) =>
        older.productionDate < a.productionDate && (taken.get(older.productionDate) ?? 0) < older.available,
    ),
  );
  return { allocations, short: Math.max(0, left), override };
}

// ─── المقارنات ───────────────────────────────────────────────────────

function unitOf(piecesPerCake: number | null): "cake" | "piece" {
  return piecesPerCake === null ? "piece" : "cake";
}

/** الطلب مقابل الإخراج (معلومة، أزرق). الكميات بوحدة السطر (كيكات أو قطع). */
export function requestVsDispatch(requested: number | null, sent: number): string | null {
  if (requested === null || requested === 0) return sent > 0 ? "إضافي" : null;
  if (sent === 0) return "ما طلع";
  if (sent > requested) return `زيادة ${sent - requested}`;
  if (sent < requested) return `أقل ${requested - sent}`;
  return null;
}

/** الإخراج مقابل الاستلام (مشكلة، أحمر). */
export function receiptDifference(sent: number, got: number, piecesPerCake: number | null): string | null {
  if (got === sent) return null;
  const n = Math.abs(got - sent);
  return `${got < sent ? "ناقص" : "زايد"} ${n} ${countWord(n, unitOf(piecesPerCake))}`;
}

/** "6 أصناف · 11 كيكة · 8 قطع". */
export function linesSummary(lines: { wholeCakes: number; loosePieces: number }[]): string {
  const used = lines.filter((l) => l.wholeCakes + l.loosePieces > 0);
  const cakes = used.reduce((s, l) => s + l.wholeCakes, 0);
  const pieces = used.reduce((s, l) => s + l.loosePieces, 0);
  const parts = [
    `${used.length} ${used.length >= 3 && used.length <= 10 ? "أصناف" : "صنف"}`,
    `${cakes} ${countWord(cakes, "cake")}`,
  ];
  if (pieces > 0) parts.push(`${pieces} ${countWord(pieces, "piece")}`);
  return parts.join(" · ");
}

// ─── المدخلات ────────────────────────────────────────────────────────

const qty = z.number().int().min(0).max(999);

export const requestLineSchema = z.object({
  productId: z.uuid(),
  wholeCakes: qty,
  loosePieces: qty,
  suggestedPieces: z.number().int().min(0).nullable().default(null),
});

export const createRequestSchema = z.object({
  lines: z
    .array(requestLineSchema)
    .max(200)
    .transform((lines) => lines.filter((l) => l.wholeCakes + l.loosePieces > 0))
    .refine((lines) => lines.length > 0, "اختار صنف واحد على الأقل"),
  note: z.string().trim().max(500).default(""),
});

export const dispatchLineSchema = z.object({
  productId: z.uuid(),
  wholeCakes: qty,
  loosePieces: qty,
  requestLineId: z.uuid().nullable().default(null),
  batches: z
    .array(
      z.object({ productionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), qty: z.number().int().min(1) }),
    )
    .max(14)
    .optional(),
});

export const createDispatchSchema = z.object({
  toLocationId: z.uuid("اختار الوجهة"),
  requestId: z.uuid().nullable().default(null),
  lines: z
    .array(dispatchLineSchema)
    .max(200)
    .transform((lines) => lines.filter((l) => l.wholeCakes + l.loosePieces > 0))
    .refine((lines) => lines.length > 0, "ما في ولا صنف طالع"),
  note: z.string().trim().max(500).default(""),
  confirmFefoOverride: z.boolean().default(false),
});

export const receiveSchema = z.object({
  dispatchId: z.uuid(),
  lines: z
    .array(
      z.object({
        dispatchLineId: z.uuid(),
        wholeCakes: qty,
        loosePieces: qty,
        note: z.string().trim().max(300).default(""),
      }),
    )
    .min(1)
    .max(200),
});

export type CreateRequestInput = z.input<typeof createRequestSchema>;
export type CreateDispatchInput = z.input<typeof createDispatchSchema>;
export type ReceiveInput = z.input<typeof receiveSchema>;
