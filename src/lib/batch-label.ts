import { dayNumberOf, parseIsoDate, type DayNumber } from "./day-number";

// رقم اليوم بيتكرر كل أسبوع، فالأصناف اللي بتعيش أكثر من 7 أيام بتنكتب عليها التاريخ
export const MAX_DAY_NUMBER_SHELF_LIFE = 7;

export function usesDate(shelfLifeDays: number): boolean {
  return shelfLifeDays > MAX_DAY_NUMBER_SHELF_LIFE;
}

/** "2026-10-25" → "25/10" (اللي بينكتب على الكيكة). */
export function shortDate(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export type BatchLabel = { kind: "day"; day: DayNumber; text: string } | { kind: "date"; text: string };

/** شو بينكتب على الدفعة: رقم اليوم، أو التاريخ للأصناف الطويلة. */
export function batchLabel(productionDate: string, shelfLifeDays: number): BatchLabel {
  if (usesDate(shelfLifeDays)) return { kind: "date", text: shortDate(productionDate) };
  const day = dayNumberOf(productionDate);
  return { kind: "day", day, text: `رقم ${day}` };
}
