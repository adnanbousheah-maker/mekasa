// جرد المواد الأولية من Excel: الكود، الاسم، التعبئة، الكمية.
// التعبئة إما الوحدة الأساسية ("كيلو") أو تعبئة مع حجمها ("كيس 25 كيلو").

export const IMPORT_HEADERS = ["الكود", "اسم المادة", "التعبئة", "الكمية"] as const;

export interface Packaging {
  // null = الكمية بالوحدة الأساسية
  unitName: string | null;
  factor: number;
  baseUnit: string;
}

export interface ExistingMaterial {
  code: string | null;
  name: string;
  baseUnit: string;
  units: { name: string; factor: number }[];
}

export interface ImportRow {
  row: number;
  code: string | null;
  name: string;
  packaging: Packaging;
  qty: number;
  // null = مادة جديدة
  existing: string | null;
  newUnit: boolean;
}

export interface ImportError {
  row: number;
  message: string;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace("٫", ".")
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/** "كيس 25 كيلو" ← تعبئة، "كيلو" ← الوحدة الأساسية. null إذا الصيغة مش مفهومة. */
export function parsePackaging(value: unknown): Packaging | null {
  const raw = text(value);
  if (!raw) return null;
  const parts = raw.match(/^(\S+)\s+([\d٠-٩.,٫]+)\s*(\S+)$/);
  if (parts) {
    const factor = toNumber(parts[2]);
    if (factor === null || factor <= 0) return null;
    return { unitName: parts[1], factor, baseUnit: parts[3] };
  }
  if (/^\S+$/.test(raw)) return { unitName: null, factor: 1, baseUnit: raw };
  return null;
}

/** التعبئة بنفس صيغة الملف، للقالب. */
export function packagingLabel(baseUnit: string, unit?: { name: string; factor: number }): string {
  return unit ? `${unit.name} ${unit.factor} ${baseUnit}` : baseUnit;
}

/**
 * بيقرأ أسطر الملف (بعد سطر العناوين) وبيقارنها بالمواد الموجودة.
 * الأسطر الفاضية (بدون كمية) بتتجاهل، مشان القالب فيه كل المواد.
 */
export function parseImportRows(
  cells: unknown[][],
  existing: ExistingMaterial[],
): { rows: ImportRow[]; errors: ImportError[] } {
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const byCode = new Map(existing.filter((m) => m.code).map((m) => [m.code!.toLowerCase(), m]));
  const byName = new Map(existing.map((m) => [m.name, m]));
  const seen = new Set<string>();

  cells.forEach((line, index) => {
    const row = index + 2; // سطر العناوين هو 1
    const [codeCell, nameCell, packagingCell, qtyCell] = line;
    const code = text(codeCell) || null;
    const name = text(nameCell);
    const qtyText = text(qtyCell);
    if (!code && !name && !qtyText) return;
    if (!qtyText) return;

    const qty = toNumber(qtyCell);
    if (qty === null || qty < 0) {
      errors.push({ row, message: "الكمية لازم تكون رقم" });
      return;
    }
    if (code && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(code)) {
      errors.push({ row, message: "الكود حروف إنجليزي وأرقام بس" });
      return;
    }
    const match =
      (code ? byCode.get(code.toLowerCase()) : undefined) ?? (name ? byName.get(name) : undefined);
    if (!match && !name) {
      errors.push({ row, message: "مادة جديدة بدها اسم" });
      return;
    }
    // تعبئة فاضية لمادة موجودة = الوحدة الأساسية. تعبئة مكتوبة ومش مفهومة = خطأ (مش وحدة أساسية بالغلط)
    const packaging = text(packagingCell)
      ? parsePackaging(packagingCell)
      : match
        ? { unitName: null, factor: 1, baseUnit: match.baseUnit }
        : null;
    if (!packaging) {
      errors.push({ row, message: 'اكتب التعبئة متل "كيس 25 كيلو" أو "كيلو"' });
      return;
    }
    if (match && packaging.baseUnit !== match.baseUnit && packaging.unitName === null) {
      // "كيس" لحاله لمادة موجودة: تعبئة معروفة بدون حجم
      const known = match.units.find((u) => u.name === packaging.baseUnit);
      if (!known) {
        errors.push({
          row,
          message: `${match.name} بالـ${match.baseUnit}. اكتب "${packaging.baseUnit} [الحجم] ${match.baseUnit}"`,
        });
        return;
      }
      packaging.unitName = known.name;
      packaging.factor = known.factor;
      packaging.baseUnit = match.baseUnit;
    } else if (match && packaging.baseUnit !== match.baseUnit) {
      errors.push({ row, message: `${match.name} بالـ${match.baseUnit} مش بالـ${packaging.baseUnit}` });
      return;
    }
    let newUnit = false;
    if (match && packaging.unitName) {
      const known = match.units.find((u) => u.name === packaging.unitName);
      if (known && known.factor !== packaging.factor) {
        errors.push({
          row,
          message: `${packaging.unitName} ${match.name} = ${known.factor} ${match.baseUnit}، مش ${packaging.factor}`,
        });
        return;
      }
      newUnit = !known;
    } else if (!match && packaging.unitName) {
      newUnit = true;
    }
    const key = match ? match.name : name;
    if (seen.has(key)) {
      errors.push({ row, message: "المادة مكررة بالملف" });
      return;
    }
    seen.add(key);
    rows.push({
      row,
      code,
      name: match?.name ?? name,
      packaging,
      qty,
      existing: match?.name ?? null,
      newUnit,
    });
  });

  return { rows, errors };
}

/** الكمية بالوحدة الأساسية، للعرض قبل التأكيد. */
export function baseQuantity(row: ImportRow): number {
  return Math.round(row.qty * row.packaging.factor * 1000) / 1000;
}
