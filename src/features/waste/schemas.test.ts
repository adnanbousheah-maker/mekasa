import { describe, expect, it } from "vitest";
import { wasteSchema, wasteSubmitLabel } from "./schemas";

const productId = "11111111-1111-4111-8111-111111111111";
const reasonId = "22222222-2222-4222-8222-222222222222";

describe("wasteSchema", () => {
  it("accepts a simple branch waste with defaults", () => {
    expect(wasteSchema.parse({ productId, unit: "cake", qty: 2, reasonId })).toEqual({
      productId,
      unit: "cake",
      qty: 2,
      reasonId,
      requiresNote: false,
      note: "",
      productionDate: null,
      photoPath: null,
    });
  });

  it("needs a note when the reason asks for one", () => {
    const base = { productId, unit: "piece" as const, qty: 1, reasonId, requiresNote: true };
    expect(wasteSchema.safeParse({ ...base, note: "  " }).error?.issues[0]?.message).toBe("اكتب شو صار");
    expect(wasteSchema.safeParse({ ...base, note: "وقعت" }).success).toBe(true);
  });

  it("rejects zero, missing product and a bad date", () => {
    expect(wasteSchema.safeParse({ productId, unit: "cake", qty: 0, reasonId }).success).toBe(false);
    expect(wasteSchema.safeParse({ productId: "", unit: "cake", qty: 1, reasonId }).success).toBe(false);
    expect(
      wasteSchema.safeParse({ productId, unit: "cake", qty: 1, reasonId, productionDate: "23/10" }).success,
    ).toBe(false);
  });
});

describe("wasteSubmitLabel", () => {
  it("uses the right word for the number", () => {
    expect(wasteSubmitLabel(1, "cake")).toBe("سجّل كيكة تالفة");
    expect(wasteSubmitLabel(2, "piece")).toBe("سجّل قطعتين تالفات");
    expect(wasteSubmitLabel(3, "cake")).toBe("سجّل 3 كيكات تالفة");
    expect(wasteSubmitLabel(5, "piece")).toBe("سجّل 5 قطع تالفة");
  });
});
