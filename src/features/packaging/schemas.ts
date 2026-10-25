import { z } from "zod";

// المستودع بيعدّ بالآلاف (أكياس، علب)
export const MAX_PACKAGING_COUNT = 99_999;

export const packagingCountSchema = z.object({
  startedAt: z.iso.datetime({ offset: true }),
  lines: z
    .array(z.object({ productId: z.uuid(), qty: z.number().int().min(0).max(MAX_PACKAGING_COUNT) }))
    .max(400),
});

export type PackagingCountInput = z.input<typeof packagingCountSchema>;
