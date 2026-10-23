import { z } from "zod";

// نفس حدود CHECK بقاعدة البيانات (foundation.sql)، مشان الخطأ يطلع رسالة واضحة قبل ما يوصل هناك.

export const PIECES_PER_CAKE_LIMITS = { min: 1, max: 50 } as const;
export const PRODUCT_NAME_MAX = 80;

export const NUMBER_SETTINGS = {
  default_pieces_per_cake: PIECES_PER_CAKE_LIMITS,
  unreceived_alert_hours: { min: 1, max: 72 },
  // رقم اليوم بيتكرر كل أسبوع، فأكثر من 7 بيخلي دفعتين إلهم نفس الرقم
  factory_shelf_life_days: { min: 1, max: 7 },
  branch_shelf_life_days: { min: 1, max: 14 },
  count_reminder_minutes_before: { min: 0, max: 120 },
  count_late_after_minutes: { min: 0, max: 240 },
} as const;

export const TOGGLE_SETTINGS = [
  "order_approval_required",
  "photo_count_enabled",
  "branch_transfers_enabled",
  "returns_enabled",
] as const;

export type NumberSetting = keyof typeof NUMBER_SETTINGS;
export type ToggleSetting = (typeof TOGGLE_SETTINGS)[number];

export function isNumberSetting(key: string): key is NumberSetting {
  return Object.hasOwn(NUMBER_SETTINGS, key);
}

export function isToggleSetting(key: string): key is ToggleSetting {
  return (TOGGLE_SETTINGS as readonly string[]).includes(key);
}

/** رقم صحيح من حقل نص (الأرقام العربية ٠–٩ مقبولة كمان). */
export function wholeNumber({ min, max }: { min: number; max: number }) {
  const message = `اكتب رقم بين ${min} و${max}`;
  return z
    .string()
    .trim()
    .transform((value) => value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)))
    .pipe(z.string().regex(/^\d{1,4}$/, message))
    .transform(Number)
    .pipe(z.number().int().min(min, message).max(max, message));
}

export function numberSettingSchema(key: NumberSetting) {
  return wholeNumber(NUMBER_SETTINGS[key]);
}

/** فاضي = الرقم العام (null). */
export const piecesOverrideSchema = z.union([
  z
    .string()
    .trim()
    .length(0)
    .transform(() => null),
  wholeNumber(PIECES_PER_CAKE_LIMITS),
]);

/** فاضي = بدون اسم عربي (null)، والصنف بيطلع باسمه الإنجليزي. */
export const nameArSchema = z
  .string()
  .trim()
  .max(PRODUCT_NAME_MAX, "الاسم طويل كثير")
  .transform((value) => value || null);

export const SELL_MODES = ["whole_and_pieces", "pieces_only"] as const;
export type SellMode = (typeof SELL_MODES)[number];

export const SELL_MODE_LABELS: Record<SellMode, string> = {
  whole_and_pieces: "كيكة وقطع",
  pieces_only: "قطعة بس",
};

export const newProductSchema = z
  .object({
    nameEn: z.string().trim().min(1, "اكتب اسم الصنف").max(PRODUCT_NAME_MAX, "الاسم طويل كثير"),
    nameAr: nameArSchema,
    sellMode: z.enum(SELL_MODES, "اختار نوع الصنف"),
    piecesPerCake: piecesOverrideSchema,
  })
  // القطعة بس ما إلها كيكة (نفس قيد pieces_only_has_no_cake_size)
  .transform((p) => (p.sellMode === "pieces_only" ? { ...p, piecesPerCake: null } : p));

export type NewProduct = z.output<typeof newProductSchema>;

/** "9:00" أو "09:00" أو "21:30" → "09:00". */
export const scheduleTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "اختار ساعة صحيحة")
  .transform((value) => value.padStart(5, "0"));

/** "09:00:00" → "9:00" متل التصميم. */
export function formatScheduleTime(timeOfDay: string): string {
  const [hours = "0", minutes = "00"] = timeOfDay.split(":");
  return `${Number(hours)}:${minutes}`;
}
