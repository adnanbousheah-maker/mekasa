import { z } from "zod";

/** "38 كيلو"، "12.5 لتر": بدون أصفار زايدة. */
export function amount(n: number, unit: string): string {
  const rounded = Math.round(n * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded : rounded.toString()} ${unit}`;
}

/** "بيكفي 5 أيام"، "يومين"، "أقل من يوم"، أو null إذا ما في صرف. */
export function daysLeftLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days < 1) return "أقل من يوم";
  if (days === 1) return "يوم";
  if (days === 2) return "يومين";
  return days <= 10 ? `${days} أيام` : `${days} يوم`;
}

export function daysTone(days: number | null): "danger" | "warn" | "ok" | null {
  if (days === null) return null;
  if (days <= 2) return "danger";
  if (days <= 4) return "warn";
  return "ok";
}

const positive = z.number().positive("الكمية لازم تكون أكثر من صفر").max(1_000_000);

export const rawMoveSchema = z.object({
  materialId: z.uuid("اختار المادة"),
  kind: z.enum(["receipt", "issue"]),
  qty: positive,
  unitId: z.uuid().nullable().default(null),
  supplierName: z.string().trim().max(80).default(""),
  invoicePhotoPath: z.string().min(1).max(300).nullable().default(null),
});

export const rawCountSchema = z.object({
  startedAt: z.iso.datetime({ offset: true }),
  lines: z
    .array(
      z.object({
        materialId: z.uuid(),
        unitId: z.uuid().nullable().default(null),
        qty: z.number().min(0).max(1_000_000),
      }),
    )
    .min(1, "اكتب كمية مادة وحدة على الأقل")
    .max(200),
});

export const newMaterialSchema = z.object({
  name: z.string().trim().min(1, "اكتب اسم المادة").max(80, "الاسم طويل كثير"),
  baseUnit: z.string().trim().min(1, "اكتب الوحدة (كيلو، لتر، حبة…)").max(20),
  minQty: z.number().min(0).max(1_000_000).default(0),
  unitName: z.string().trim().max(20).default(""),
  unitFactor: z.number().positive().max(100_000).nullable().default(null),
});

export type RawMoveInput = z.input<typeof rawMoveSchema>;
export type RawCountInput = z.input<typeof rawCountSchema>;
export type NewMaterialInput = z.input<typeof newMaterialSchema>;
