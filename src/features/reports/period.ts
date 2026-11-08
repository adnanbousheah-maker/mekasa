// فترات تقارير الإدارة ومقارنتها بالفترة اللي قبلها (نفس الطول). الأسبوع بيبلش السبت (يوم 1).

import { dayNumberOf } from "@/lib/day-number";
import { addDays } from "./format";

export const PERIOD_PRESETS = ["week", "last-week", "month", "last-month", "30d", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  week: "هالأسبوع",
  "last-week": "الأسبوع الماضي",
  month: "هالشهر",
  "last-month": "الشهر الماضي",
  "30d": "آخر 30 يوم",
  custom: "فترة ثانية",
};

export interface Period {
  preset: PeriodPreset;
  from: string;
  to: string;
  days: number;
  // الفترة اللي قبلها بنفس الطول (للمقارنة)
  previous: { from: string; to: string };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 8)}01`;
}

/** الفترة من الرابط. أي شي غلط بيرجع لـ "هالأسبوع". */
export function resolvePeriod(
  today: string,
  preset: string | undefined,
  customFrom?: string,
  customTo?: string,
): Period {
  let p: PeriodPreset = (PERIOD_PRESETS as readonly string[]).includes(preset ?? "")
    ? (preset as PeriodPreset)
    : "week";
  let from: string;
  let to = today;
  const weekStart = addDays(today, -(dayNumberOf(today) - 1));
  switch (p) {
    case "last-week":
      from = addDays(weekStart, -7);
      to = addDays(weekStart, -1);
      break;
    case "month":
      from = monthStart(today);
      break;
    case "last-month": {
      to = addDays(monthStart(today), -1);
      from = monthStart(to);
      break;
    }
    case "30d":
      from = addDays(today, -29);
      break;
    case "custom":
      if (
        customFrom &&
        customTo &&
        ISO.test(customFrom) &&
        ISO.test(customTo) &&
        customFrom <= customTo &&
        customTo <= today &&
        daysBetween(customFrom, customTo) <= 366
      ) {
        from = customFrom;
        to = customTo;
        break;
      }
      p = "week";
      from = weekStart;
      break;
    default:
      from = weekStart;
  }
  const days = daysBetween(from, to);
  return { preset: p, from, to, days, previous: { from: addDays(from, -days), to: addDays(from, -1) } };
}

/** التغيير % مقارنة بالفترة اللي قبلها (null إذا ما في أساس). */
export function change(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** نسبة التالف من (الاستهلاك + التالف)، بمنزلة عشرية وحدة. */
export function wasteShare(consumed: number, waste: number): number | null {
  // بدون استهلاك محسوب (أقل من جردين) النسبة ما إلها معنى
  if (consumed <= 0) return null;
  return Math.round((waste / (consumed + waste)) * 1000) / 10;
}
