import { describe, expect, it } from "vitest";
import { amount, daysLeftLabel, daysTone, newMaterialSchema, rawCountSchema, rawMoveSchema } from "./logic";

const id = "11111111-1111-4111-8111-111111111111";

describe("amount", () => {
  it("drops trailing zeros", () => {
    expect(amount(38, "كيلو")).toBe("38 كيلو");
    expect(amount(12.5, "لتر")).toBe("12.5 لتر");
    expect(amount(0.1 + 0.2, "كيلو")).toBe("0.3 كيلو");
  });
});

describe("days left", () => {
  it("speaks like the design and colours by urgency", () => {
    expect(daysLeftLabel(null)).toBeNull();
    expect(daysLeftLabel(0)).toBe("أقل من يوم");
    expect(daysLeftLabel(1)).toBe("يوم");
    expect(daysLeftLabel(2)).toBe("يومين");
    expect(daysLeftLabel(5)).toBe("5 أيام");
    expect(daysLeftLabel(30)).toBe("30 يوم");
    expect([daysTone(null), daysTone(2), daysTone(4), daysTone(9)]).toEqual([null, "danger", "warn", "ok"]);
  });
});

describe("schemas", () => {
  it("needs a positive quantity and a material", () => {
    expect(
      rawMoveSchema.safeParse({ materialId: id, kind: "receipt", qty: 0 }).error?.issues[0]?.message,
    ).toBe("الكمية لازم تكون أكثر من صفر");
    expect(rawMoveSchema.parse({ materialId: id, kind: "issue", qty: 2.5 }).unitId).toBeNull();
  });

  it("counts need at least one line", () => {
    expect(rawCountSchema.safeParse({ startedAt: "2026-10-23T06:00:00Z", lines: [] }).success).toBe(false);
  });

  it("a new material needs a name and a unit", () => {
    expect(newMaterialSchema.safeParse({ name: " ", baseUnit: "كيلو" }).error?.issues[0]?.message).toBe(
      "اكتب اسم المادة",
    );
    expect(newMaterialSchema.parse({ name: "طحين", baseUnit: "كيلو" })).toEqual({
      name: "طحين",
      baseUnit: "كيلو",
      minQty: 0,
      unitName: "",
      unitFactor: null,
    });
  });
});
