import { describe, expect, it } from "vitest";
import { wasteSchema, wasteSubmitLabel } from "./schemas";

const productId = "11111111-1111-4111-8111-111111111111";

describe("wasteSchema", () => {
  it("accepts a simple branch waste with defaults", () => {
    expect(wasteSchema.parse({ productId, unit: "cake", qty: 2, reason: "broken" })).toEqual({
      productId,
      unit: "cake",
      qty: 2,
      reason: "broken",
      note: "",
      productionDate: null,
      photoPath: null,
    });
  });

  it("needs a note when the reason is other", () => {
    const result = wasteSchema.safeParse({ productId, unit: "piece", qty: 1, reason: "other", note: "  " });
    expect(result.error?.issues[0]?.message).toBe("اكتب شو صار");
    expect(
      wasteSchema.safeParse({ productId, unit: "piece", qty: 1, reason: "other", note: "وقعت" }).success,
    ).toBe(true);
  });

  it("rejects zero, missing product and a bad date", () => {
    expect(wasteSchema.safeParse({ productId, unit: "cake", qty: 0, reason: "broken" }).success).toBe(false);
    expect(wasteSchema.safeParse({ productId: "", unit: "cake", qty: 1, reason: "broken" }).success).toBe(
      false,
    );
    expect(
      wasteSchema.safeParse({ productId, unit: "cake", qty: 1, reason: "broken", productionDate: "23/10" })
        .success,
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
