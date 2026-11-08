// المهام المتكررة: وصف التكرار بالعربي، والفحص قبل الحفظ (نفس CHECK قاعدة البيانات).

import { z } from "zod";
import { DAY_NAMES, type DayNumber } from "@/lib/day-number";

export const FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "كل يوم",
  weekly: "أيام بالأسبوع",
  monthly: "مرة بالشهر",
};

export interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  locationIds: string[] | null;
  role: string;
  frequency: Frequency;
  weekdays: number[] | null;
  monthDay: number | null;
  dueTime: string;
  requiresPhoto: boolean;
  isActive: boolean;
}

/** "كل يوم"، "السبت والثلاثاء"، "يوم 1 بالشهر"، "آخر يوم بالشهر". */
export function scheduleLabel(t: Pick<TaskTemplate, "frequency" | "weekdays" | "monthDay">): string {
  if (t.frequency === "daily") return "كل يوم";
  if (t.frequency === "weekly") {
    const days = [...(t.weekdays ?? [])].sort((a, b) => a - b);
    if (days.length === 7) return "كل يوم";
    return days.map((d) => DAY_NAMES[d as DayNumber]).join(" و");
  }
  return t.monthDay === 31 ? "آخر يوم بالشهر" : `يوم ${t.monthDay} بالشهر`;
}

export const templateSchema = z
  .object({
    title: z.string().trim().min(2, "اكتب اسم المهمة").max(80, "الاسم طويل كثير"),
    description: z
      .string()
      .trim()
      .max(300, "الوصف طويل كثير")
      .transform((v) => v || null),
    locationIds: z.array(z.uuid()).transform((ids) => (ids.length ? ids : null)),
    role: z.enum(["branch_staff", "branch_manager", "dispatcher", "storekeeper", "packaging_keeper"]),
    frequency: z.enum(FREQUENCIES),
    weekdays: z.array(z.number().int().min(1).max(7)),
    monthDay: z.number().int().min(1).max(31).nullable(),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "اختار الساعة"),
    requiresPhoto: z.boolean(),
  })
  .refine((t) => t.frequency !== "weekly" || t.weekdays.length > 0, {
    message: "اختار يوم واحد على الأقل",
    path: ["weekdays"],
  })
  .refine((t) => t.frequency !== "monthly" || t.monthDay !== null, {
    message: "اختار يوم الشهر",
    path: ["monthDay"],
  });

export type TemplateInput = z.input<typeof templateSchema>;
