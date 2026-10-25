import { describe, expect, it } from "vitest";
import {
  createDispatchSchema,
  createRequestSchema,
  fefoAllocate,
  forgottenItems,
  linesSummary,
  receiptDifference,
  requestVsDispatch,
  suggestQuantity,
} from "./logic";

const id = "11111111-1111-4111-8111-111111111111";

describe("suggestQuantity", () => {
  it("rounds cakes up and keeps pieces for pieces-only products", () => {
    expect(suggestQuantity(200, 135, 10)).toEqual({ wholeCakes: 7, loosePieces: 0, suggestedPieces: 65 });
    expect(suggestQuantity(20, 7, null)).toEqual({ wholeCakes: 0, loosePieces: 13, suggestedPieces: 13 });
  });
  it("suggests nothing when stock is at or above par, or no par", () => {
    expect(suggestQuantity(200, 250, 10).suggestedPieces).toBe(0);
    expect(suggestQuantity(undefined, 0, 10).suggestedPieces).toBe(0);
    // ستوك سالب (تالف أكثر من الجرد) بينحسب صفر
    expect(suggestQuantity(20, -5, 10)).toEqual({ wholeCakes: 2, loosePieces: 0, suggestedPieces: 20 });
  });
});

describe("fefoAllocate", () => {
  const batches = [
    { productionDate: "2026-10-22", available: 40 },
    { productionDate: "2026-10-19", available: 20 },
    { productionDate: "2026-10-16", available: 10, expired: true },
  ];

  it("takes the oldest usable batch first and skips expired ones", () => {
    expect(fefoAllocate(batches, 30)).toEqual({
      allocations: [
        { productionDate: "2026-10-19", qty: 20 },
        { productionDate: "2026-10-22", qty: 10 },
      ],
      short: 0,
      override: false,
    });
  });

  it("flags an override when a newer batch is picked first", () => {
    const result = fefoAllocate(batches, 10, "2026-10-22");
    expect(result.allocations).toEqual([{ productionDate: "2026-10-22", qty: 10 }]);
    expect(result.override).toBe(true);
  });

  it("is not an override when the older batch is used up anyway", () => {
    expect(fefoAllocate(batches, 60, "2026-10-22").override).toBe(false);
  });

  it("reports what is missing", () => {
    expect(fefoAllocate(batches, 70).short).toBe(10);
  });
});

describe("comparisons", () => {
  it("describes request vs dispatch as information", () => {
    expect(requestVsDispatch(3, 3)).toBeNull();
    expect(requestVsDispatch(2, 3)).toBe("زيادة 1");
    expect(requestVsDispatch(2, 1)).toBe("أقل 1");
    expect(requestVsDispatch(2, 0)).toBe("ما طلع");
    expect(requestVsDispatch(null, 2)).toBe("إضافي");
    expect(requestVsDispatch(0, 0)).toBeNull();
  });

  it("describes dispatch vs receipt as a problem", () => {
    expect(receiptDifference(3, 3, 10)).toBeNull();
    expect(receiptDifference(3, 2, 10)).toBe("ناقص 1 كيكة");
    expect(receiptDifference(10, 13, null)).toBe("زايد 3 قطع");
  });

  it("summarizes lines", () => {
    expect(
      linesSummary([
        { wholeCakes: 3, loosePieces: 0 },
        { wholeCakes: 0, loosePieces: 8 },
        { wholeCakes: 0, loosePieces: 0 },
      ]),
    ).toBe("2 صنف · 3 كيكات · 8 قطع");
  });
});

describe("forgottenItems", () => {
  it("lists suggested items left at zero", () => {
    const products = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const rows = {
      a: { wholeCakes: 0, loosePieces: 0, suggestedPieces: 20 },
      b: { wholeCakes: 1, loosePieces: 0, suggestedPieces: 20 },
      c: { wholeCakes: 0, loosePieces: 0, suggestedPieces: 0 },
    };
    expect(forgottenItems(products, rows).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("schemas", () => {
  it("drops empty request lines and needs at least one", () => {
    const parsed = createRequestSchema.parse({
      lines: [
        { productId: id, wholeCakes: 2, loosePieces: 0 },
        { productId: id, wholeCakes: 0, loosePieces: 0 },
      ],
    });
    expect(parsed.lines).toHaveLength(1);
    expect(
      createRequestSchema.safeParse({ lines: [{ productId: id, wholeCakes: 0, loosePieces: 0 }] }).error
        ?.issues[0]?.message,
    ).toBe("اختار صنف واحد على الأقل");
  });

  it("needs a destination for a dispatch", () => {
    expect(createDispatchSchema.safeParse({ toLocationId: "", lines: [] }).error?.issues[0]?.message).toBe(
      "اختار الوجهة",
    );
    expect(
      createDispatchSchema.parse({
        toLocationId: id,
        lines: [{ productId: id, wholeCakes: 1, loosePieces: 0 }],
      }).confirmFefoOverride,
    ).toBe(false);
  });
});
