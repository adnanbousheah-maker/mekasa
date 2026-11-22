import { z } from "zod";
import { countPhrase } from "@/lib/units";

// ─── الكمية المقترحة: الحد المطلوب − الموجود ─────────────────────────

/** فوق الحد الأدنى لبكرا: 25% (اجتماع 20 نوفمبر، كان +5 كيكات). */
export const ORDER_EXTRA_RATIO = 0.25;

/**
 * شو لازم يكون عند الفرع بكرا (بالقطع). إذا إله حد أدنى لبكرا: الحد + 25%، مقرّب لفوق لكيكة كاملة
 * (أو لقطعة للأصناف اللي قطع بس). وإلا معدل الاستهلاك إذا معروف، وإلا الحد المطلوب.
 */
export function orderTarget(
  avgPieces: number | null,
  parPieces: number | null | undefined,
  minTomorrow: number | null = null,
  piecesPerCake: number | null = null,
): number | undefined {
  if (minTomorrow !== null) {
    const unit = piecesPerCake ?? 1;
    return Math.ceil((minTomorrow * (1 + ORDER_EXTRA_RATIO)) / unit - 1e-9) * unit;
  }
  return avgPieces ?? parPieces ?? undefined;
}

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

/** المصنع بيطلّع كيكات كاملة بس: الكمية بتتقرّب لفوق لأقرب كيكة. الأصناف اللي قطع بس متل ما هي. */
export function asWholeCakes(
  q: { wholeCakes: number; loosePieces: number },
  piecesPerCake: number | null,
): { wholeCakes: number; loosePieces: number } {
  if (piecesPerCake === null || q.loosePieces === 0) return q;
  return {
    wholeCakes: Math.ceil((q.wholeCakes * piecesPerCake + q.loosePieces) / piecesPerCake),
    loosePieces: 0,
  };
}

// ─── FEFO: من الأقدم أول ─────────────────────────────────────────────

export interface BatchStock {
  productionDate: string;
  available: number;
  expired?: boolean;
  // المفرّز دفعة لحالها بنفس التاريخ
  frozen?: boolean;
  // آخر يوم صلاحية (المفرّز 30 يوم). الترتيب عليه، وبدونه على تاريخ الإنتاج
  expiresOn?: string;
}

export interface BatchPick {
  productionDate: string;
  frozen?: boolean;
  qty: number;
}

/** مفتاح الدفعة: التاريخ، و"|f" للمفرّزة. */
export function batchKey(b: { productionDate: string; frozen?: boolean }): string {
  return b.frozen ? `${b.productionDate}|f` : b.productionDate;
}

/** اللي بتخلص صلاحيته أول، وبعدين الأقدم إنتاج (الطازة قبل المفرّز). */
function byExpiry(a: BatchStock, b: BatchStock): number {
  return (
    (a.expiresOn ?? a.productionDate).localeCompare(b.expiresOn ?? b.productionDate) ||
    a.productionDate.localeCompare(b.productionDate) ||
    Number(a.frozen ?? false) - Number(b.frozen ?? false)
  );
}

export interface Allocation {
  allocations: BatchPick[];
  short: number;
  // أخذنا من دفعة أحدث وفي دفعة أقدم (مش منتهية) ضل فيها
  override: boolean;
}

/**
 * توزيع الكمية على الدفعات: من الدفعة اللي اختارها الموظف أول (إذا اختار)، وبعدين الأقدم فالأحدث.
 * المنتهية ما بتنحسب. نفس منطق create_dispatch بقاعدة البيانات، للعرض قبل التأكيد.
 */
export function fefoAllocate(batches: BatchStock[], qty: number, firstKey?: string | null): Allocation {
  const usable = batches.filter((b) => !b.expired && b.available > 0).sort(byExpiry);
  const order = firstKey
    ? [...usable.filter((b) => batchKey(b) === firstKey), ...usable.filter((b) => batchKey(b) !== firstKey)]
    : usable;

  let left = qty;
  const allocations: Allocation["allocations"] = [];
  for (const b of order) {
    if (left <= 0) break;
    const take = Math.min(left, b.available);
    allocations.push({ productionDate: b.productionDate, frozen: b.frozen ?? false, qty: take });
    left -= take;
  }
  const taken = new Map(allocations.map((a) => [batchKey(a), a.qty]));
  const expiry = (b: { productionDate: string; frozen?: boolean }) =>
    usable.find((u) => batchKey(u) === batchKey(b))?.expiresOn ?? b.productionDate;
  const override = allocations.some((a) =>
    usable.some(
      (older) =>
        (older.expiresOn ?? older.productionDate) < expiry(a) &&
        (taken.get(batchKey(older)) ?? 0) < older.available,
    ),
  );
  return { allocations, short: Math.max(0, left), override };
}

// ─── توزيع اليوم: القديم على الكل بالعدل ─────────────────────────────

export interface RoundLine {
  key: string;
  qty: number;
}

/**
 * لصنف واحد: المجموع من الأقدم (FEFO، بدون المنتهي)، وكل دفعة بتنقسم على الأسطر حسب اللي
 * ضايل لكل سطر. الباقي واحد واحد للكسر الأكبر (وبعدين بالترتيب). إذا كل الأسطر كيكات كاملة
 * والدفعات فيها كيكات كاملة بتكفي، القسمة بالكيكة. نفس dispatch_round بقاعدة البيانات.
 */
export function fairAllocate(
  batches: BatchStock[],
  lines: RoundLine[],
  piecesPerCake: number | null = null,
): { byLine: Map<string, BatchPick[]>; short: number } {
  const usable = batches.filter((b) => !b.expired && b.available > 0).sort(byExpiry);
  const total = lines.reduce((s, l) => s + Math.max(0, l.qty), 0);
  const cake = piecesPerCake ?? 1;
  const unit =
    cake > 1 &&
    lines.every((l) => l.qty % cake === 0) &&
    usable.reduce((s, b) => s + Math.floor(b.available / cake) * cake, 0) >= total
      ? cake
      : 1;

  const remaining = lines.map((l) => Math.max(0, l.qty) / unit);
  const byLine = new Map(lines.map((l) => [l.key, [] as BatchPick[]]));
  let remainingTotal = total / unit;

  for (const b of usable) {
    if (remainingTotal <= 0) break;
    const take = Math.min(Math.floor(b.available / unit), remainingTotal);
    if (take <= 0) continue;
    const share = remaining.map((r) => (r > 0 ? Math.floor((take * r) / remainingTotal) : 0));
    let leftover = take - share.reduce((s, x) => s + x, 0);
    const order = remaining
      .map((r, i) => ({ i, fraction: (take * r) % remainingTotal }))
      .filter((x) => remaining[x.i] - share[x.i] > 0)
      .sort((x, y) => y.fraction - x.fraction || x.i - y.i);
    for (const { i } of order) {
      if (leftover <= 0) break;
      share[i] += 1;
      leftover -= 1;
    }
    share.forEach((x, i) => {
      if (x <= 0) return;
      byLine
        .get(lines[i].key)!
        .push({ productionDate: b.productionDate, frozen: b.frozen ?? false, qty: x * unit });
      remaining[i] -= x;
      remainingTotal -= x;
    });
  }
  return { byLine, short: remainingTotal * unit };
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
  return `${got < sent ? "ناقص" : "زايد"} ${countPhrase(n, unitOf(piecesPerCake))}`;
}

/** "6 أصناف · 11 كيكة · 8 قطع". */
export function linesSummary(
  lines: { wholeCakes: number; loosePieces: number }[],
  // مواد التغليف بالحبة
  packaging = false,
): string {
  const used = lines.filter((l) => l.wholeCakes + l.loosePieces > 0);
  if (packaging) {
    const units = used.reduce((s, l) => s + l.loosePieces, 0);
    return `${used.length} ${used.length >= 3 && used.length <= 10 ? "أصناف" : "صنف"} · ${units} حبة`;
  }
  const cakes = used.reduce((s, l) => s + l.wholeCakes, 0);
  const pieces = used.reduce((s, l) => s + l.loosePieces, 0);
  const parts = [
    `${used.length} ${used.length >= 3 && used.length <= 10 ? "أصناف" : "صنف"}`,
    countPhrase(cakes, "cake"),
  ];
  if (pieces > 0) parts.push(countPhrase(pieces, "piece"));
  return parts.join(" · ");
}

// ─── المدخلات ────────────────────────────────────────────────────────

// التغليف بينطلب بالمية (أكياس، علب)
const qty = z.number().int().min(0).max(9999);

/** القطع (والصوصات باللتر) بطلب الفرع من المصنع لحد 99 (رقمين). التغليف بالحبة بدون هالحد (بقاعدة البيانات). */
export const MAX_REQUEST_PIECES = 99;

/** الفرع بيعدّل أو بيلغي طلبه خلال ربع ساعة من وقت الطلب الأصلي (نفس private.request_edit_minutes). */
export const REQUEST_EDIT_MINUTES = 15;

/** كم دقيقة ضايل للتعديل (0 = خلص الوقت). */
export function editMinutesLeft(requestedAt: string, now: Date): number {
  const left = REQUEST_EDIT_MINUTES * 60_000 - (now.getTime() - new Date(requestedAt).getTime());
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

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
  // أصناف كانت مقترحة والموظف شاف التنبيه وبعت بدونها
  missing: z
    .array(z.object({ productId: z.uuid(), suggestedPieces: z.number().int().min(1) }))
    .max(200)
    .default([]),
});

/** الأصناف اللي إلها كمية مقترحة والموظف خلاها صفر. */
export function forgottenItems<T extends { id: string }>(
  products: T[],
  rows: Record<string, { wholeCakes: number; loosePieces: number; suggestedPieces: number }>,
): T[] {
  return products.filter((p) => {
    const row = rows[p.id];
    return row && row.suggestedPieces > 0 && row.wholeCakes + row.loosePieces === 0;
  });
}

export const dispatchLineSchema = z.object({
  productId: z.uuid(),
  wholeCakes: qty,
  loosePieces: qty,
  requestLineId: z.uuid().nullable().default(null),
  batches: z
    .array(
      z.object({
        productionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        frozen: z.boolean().default(false),
        qty: z.number().int().min(1),
      }),
    )
    .max(28)
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
  // اسم السائق (اختياري): بيطلع مع التوالف وقت الاستلام
  driverName: z.string().trim().max(60).default(""),
  // الطلب طلع جزء منه والباقي ما رح يطلع: بيتسكّر (بدونها بيضل مفتوح لآخر اليوم)
  closeRequest: z.boolean().default(false),
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
        // من اللي وصل، قديش كان تالف من التوصيل
        damagedWhole: qty.default(0),
        damagedLoose: qty.default(0),
      }),
    )
    .min(1)
    .max(200),
  // الموظف لازم يأكد إنه فحص البضاعة قدام السائق
  checked: z.literal(true, "أكّد إنك فحصت البضاعة قدام السائق"),
});

// توزيع اليوم: كل طلب بإخراج، والدفعات بتختارها قاعدة البيانات (fairAllocate)
export const roundSchema = z
  .array(
    z.object({
      requestId: z.uuid(),
      driverName: z.string().trim().max(60).default(""),
      lines: z
        .array(
          z.object({
            productId: z.uuid(),
            requestLineId: z.uuid().nullable().default(null),
            wholeCakes: qty,
            loosePieces: qty,
          }),
        )
        .max(200)
        .transform((lines) => lines.filter((l) => l.wholeCakes + l.loosePieces > 0)),
    }),
  )
  .max(50)
  .transform((entries) => entries.filter((e) => e.lines.length > 0))
  .refine((entries) => entries.length > 0, "ما في ولا طلب فيه كمية");

export type RoundInput = z.input<typeof roundSchema>;

export type CreateRequestInput = z.input<typeof createRequestSchema>;
export type CreateDispatchInput = z.input<typeof createDispatchSchema>;
export type ReceiveInput = z.input<typeof receiveSchema>;
