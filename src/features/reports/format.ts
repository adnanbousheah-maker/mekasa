import { parseIsoDate } from "@/lib/day-number";

/** مجموع كميات بأحجام كيك مختلفة: كيكات كاملة + قطع باقية (لكل صنف لحاله، بعدين بنجمع). */
export function totalCakesAndPieces(items: { qty: number; piecesPerCake: number | null }[]): {
  cakes: number;
  pieces: number;
} {
  return items.reduce(
    (t, { qty, piecesPerCake }) => {
      if (qty <= 0) return t;
      if (piecesPerCake === null) return { cakes: t.cakes, pieces: t.pieces + qty };
      return { cakes: t.cakes + Math.floor(qty / piecesPerCake), pieces: t.pieces + (qty % piecesPerCake) };
    },
    { cakes: 0, pieces: 0 },
  );
}

/** الاستهلاك بالكيكات حسب حجم كل صنف: "17 كيكة"، "2.5 كيكة". */
export function cakesLabel(cakes: number): string {
  const rounded = Math.round(cakes * 10) / 10;
  const word = Number.isInteger(rounded) && rounded >= 3 && rounded <= 10 ? "كيكات" : "كيكة";
  return `${rounded} ${word}`;
}

export function toCakes(qty: number, piecesPerCake: number | null): number {
  return piecesPerCake ? qty / piecesPerCake : 0;
}

export type Range = "today" | "week" | "month";

export const RANGE_LABELS: Record<Range, string> = { today: "اليوم", week: "الأسبوع", month: "الشهر" };

export function parseRange(value: unknown): Range {
  return value === "today" || value === "month" ? value : "week";
}

const MS_PER_DAY = 86_400_000;

/** أول يوم بالفترة: اليوم، أو السبت الماضي (أول الأسبوع)، أو أول الشهر. */
export function rangeStart(range: Range, todayIso: string): string {
  if (range === "today") return todayIso;
  if (range === "month") return `${todayIso.slice(0, 8)}01`;
  const today = parseIsoDate(todayIso);
  // getUTCDay: السبت 6 ← 0 أيام لورا
  const back = (today.getUTCDay() + 1) % 7;
  return new Date(today.getTime() - back * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(parseIsoDate(isoDate).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** نسبة مئوية بمنزلة وحدة، أو null إذا ما في أساس. */
export function percent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
