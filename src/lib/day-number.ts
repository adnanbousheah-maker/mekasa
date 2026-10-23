// رقم اليوم اللي بينكتب على الكيك: السبت 1، الأحد 2، … الجمعة 7.
// بينحسب من تاريخ الإنتاج (YYYY-MM-DD بتوقيت عمّان)، وبيدور كل أسبوع،
// عشان هيك مدة الحياة بالمصنع لازم ما تزيد عن 7 أيام.

export type DayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DAY_NUMBERS: readonly DayNumber[] = [1, 2, 3, 4, 5, 6, 7];

export const DAY_COLORS: Readonly<Record<DayNumber, string>> = {
  1: "#B42318",
  2: "#C2410C",
  3: "#A16207",
  4: "#15803D",
  5: "#0E7490",
  6: "#1D4ED8",
  7: "#7E22CE",
};

export const DAY_NAMES: Readonly<Record<DayNumber, string>> = {
  1: "السبت",
  2: "الأحد",
  3: "الاثنين",
  4: "الثلاثاء",
  5: "الأربعاء",
  6: "الخميس",
  7: "الجمعة",
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** بيحول "YYYY-MM-DD" لـ Date بمنتصف ليل UTC، مشان الحساب ما يتأثر بتوقيت الجهاز. */
export function parseIsoDate(isoDate: string): Date {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`Expected YYYY-MM-DD, got "${isoDate}"`);

  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new RangeError(`Invalid calendar date "${isoDate}"`);
  }
  return date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dayNumberOf(isoDate: string): DayNumber {
  // getUTCDay: الأحد 0 … السبت 6. السبت لازم يصير 1.
  const weekday = parseIsoDate(isoDate).getUTCDay();
  return (((weekday + 1) % 7) + 1) as DayNumber;
}

/** آخر تاريخ (لحد اليوم) إله هالرقم. جرد المصنع بيستعمله ليربط "رقم 1" بالدفعة الصح. */
export function latestDateForDayNumber(day: DayNumber, todayIso: string): string {
  const today = parseIsoDate(todayIso);
  const daysBack = (dayNumberOf(todayIso) - day + 7) % 7;
  return toIsoDate(new Date(today.getTime() - daysBack * MS_PER_DAY));
}

/** التواريخ من اليوم لورا: [اليوم، أمس، …]. للدفعات الممكنة بالمصنع (بمدة الحياة، أقصى 7). */
export function recentDates(todayIso: string, days: number): string[] {
  const today = parseIsoDate(todayIso).getTime();
  return Array.from({ length: days }, (_, i) => toIsoDate(new Date(today - i * MS_PER_DAY)));
}
