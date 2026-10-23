// كل التواريخ والأوقات بالتطبيق بتوقيت عمّان، مهما كان توقيت الجهاز أو السيرفر.

import { DAY_NAMES, dayNumberOf, parseIsoDate } from "./day-number";

export const BUSINESS_TIME_ZONE = "Asia/Amman";

// أسماء الأشهر متل التصميم ("23 أكتوبر")، مش الأسماء الشامية اللي بيرجعها ar-JO.
const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clockParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const found = parts.find((p) => p.type === type);
  if (!found) throw new Error(`Missing ${type} in formatted date`);
  return found.value;
}

/** اليوم التشغيلي بعمّان بصيغة YYYY-MM-DD. */
export function businessDate(at: Date): string {
  const parts = dateParts.formatToParts(at);
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

/** "9:21" أو "21:00": ساعة بدون صفر بالأول، 24 ساعة. */
export function formatClock(at: Date): string {
  const parts = clockParts.formatToParts(at);
  return `${Number(part(parts, "hour"))}:${part(parts, "minute")}`;
}

/** "الجمعة 23 أكتوبر" */
export function formatLongDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  const weekday = DAY_NAMES[dayNumberOf(isoDate)];
  return `${weekday} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}
