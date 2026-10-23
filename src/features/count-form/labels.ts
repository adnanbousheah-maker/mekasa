// رمز نسخة الفورم المطبوع: "SWF-COUNT-v3". بينطبع تحت الـ QR وجواه، وClaude بيقرأه من الصورة،
// فبنعرف أي موقع وأي ترتيب أصناف بالفورم حتى لو تغيرت الأصناف بعد الطباعة.

const CODE = /^([A-Z0-9]{2,8})-COUNT-v(\d{1,4})$/;

export function formCode(locationCode: string, version: number): string {
  return `${locationCode}-COUNT-v${version}`;
}

export function parseFormCode(
  text: string | null | undefined,
): { locationCode: string; version: number } | null {
  const match = CODE.exec(
    (text ?? "").trim().toUpperCase().replace(/\s+/g, "").replace("-COUNT-V", "-COUNT-v"),
  );
  if (!match) return null;
  return { locationCode: match[1], version: Number(match[2]) };
}

/** هل الفورم المطبوع لسا مطابق للأصناف الفعّالة (بنفس الترتيب)؟ */
export function sameProducts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// تحت هالثقة الرقم بيتلون برتقالي وبيحتاج تأكيد الموظف
export const SURE_CONFIDENCE = 0.85;

export interface OcrRow {
  row: number;
  whole_cakes: number | null;
  loose_pieces: number | null;
  whole_confidence: number;
  pieces_confidence: number;
}

export interface ReadLine {
  productId: string;
  wholeCakes: number;
  loosePieces: number;
  unsure: boolean;
  ocr: {
    wholeCakes: number | null;
    loosePieces: number | null;
    wholeConfidence: number;
    piecesConfidence: number;
  };
}

/**
 * أسطر الفورم (برقم السطر) ← أسطر الجرد (بالصنف). المربع الفاضي صفر.
 * الأصناف اللي قطع بس: خانة الكيكات بتنتجاهل.
 */
export function mapOcrRows(
  rows: OcrRow[],
  productIds: readonly string[],
  piecesOnly: ReadonlySet<string>,
): ReadLine[] {
  const byRow = new Map(rows.map((r) => [r.row, r]));
  return productIds.map((productId, index) => {
    const r = byRow.get(index + 1);
    const noCakes = piecesOnly.has(productId);
    const wholeConfidence = noCakes ? 1 : (r?.whole_confidence ?? 0);
    const piecesConfidence = r?.pieces_confidence ?? 0;
    return {
      productId,
      wholeCakes: noCakes ? 0 : clamp(r?.whole_cakes),
      loosePieces: clamp(r?.loose_pieces),
      unsure: !r || wholeConfidence < SURE_CONFIDENCE || piecesConfidence < SURE_CONFIDENCE,
      ocr: {
        wholeCakes: noCakes ? null : (r?.whole_cakes ?? null),
        loosePieces: r?.loose_pieces ?? null,
        wholeConfidence,
        piecesConfidence,
      },
    };
  });
}

function clamp(n: number | null | undefined): number {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return 0;
  return Math.min(999, Math.round(n));
}
