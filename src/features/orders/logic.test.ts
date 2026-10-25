import { describe, expect, it } from "vitest";
import {
  createDispatchSchema,
  createRequestSchema,
  fairAllocate,
  fefoAllocate,
  forgottenItems,
  orderTarget,
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
    expect(receiptDifference(3, 2, 10)).toBe("ناقص كيكة");
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

describe("fairAllocate", () => {
  const batch = (productionDate: string, available: number, expired = false) => ({
    productionDate,
    available,
    expired,
  });

  it("shares the old batch by need instead of giving it all to the first branch", () => {
    const { byLine, short } = fairAllocate(
      [batch("2026-10-22", 30), batch("2026-10-25", 100), batch("2026-10-18", 10, true)],
      [
        { key: "swf", qty: 40 },
        { key: "jbh", qty: 20 },
      ],
    );
    expect(short).toBe(0);
    expect(byLine.get("swf")).toEqual([
      { productionDate: "2026-10-22", qty: 20 },
      { productionDate: "2026-10-25", qty: 20 },
    ]);
    expect(byLine.get("jbh")).toEqual([
      { productionDate: "2026-10-22", qty: 10 },
      { productionDate: "2026-10-25", qty: 10 },
    ]);
  });

  it("gives leftover cakes to the largest fraction, so a small branch still gets its share", () => {
    const { byLine } = fairAllocate(
      [batch("2026-10-24", 20), batch("2026-10-25", 100)],
      [
        { key: "swf", qty: 40 },
        { key: "jbh", qty: 20 },
      ],
      10,
    );
    // كيكتين قديمات: الصويفية 1.33 والجبيهة 0.67، فكل وحدة بتاخذ وحدة
    expect(byLine.get("swf")![0]).toEqual({ productionDate: "2026-10-24", qty: 10 });
    expect(byLine.get("jbh")![0]).toEqual({ productionDate: "2026-10-24", qty: 10 });
  });

  it("spreads leftover units evenly", () => {
    const { byLine } = fairAllocate(
      [batch("2026-10-22", 5), batch("2026-10-25", 10)],
      [
        { key: "a", qty: 3 },
        { key: "b", qty: 3 },
        { key: "c", qty: 3 },
      ],
    );
    const old = ["a", "b", "c"].map(
      (k) => byLine.get(k)!.find((x) => x.productionDate === "2026-10-22")?.qty ?? 0,
    );
    expect(old.reduce((s, x) => s + x, 0)).toBe(5);
    expect(Math.max(...old) - Math.min(...old)).toBeLessThanOrEqual(1);
    for (const k of ["a", "b", "c"]) expect(byLine.get(k)!.reduce((s, x) => s + x.qty, 0)).toBe(3);
  });

  it("splits whole cakes when every line is whole cakes", () => {
    const { byLine } = fairAllocate(
      [batch("2026-10-24", 20), batch("2026-10-25", 40)],
      [
        { key: "swf", qty: 40 },
        { key: "jbh", qty: 20 },
      ],
      10,
    );
    // بالقطع كان رح يطلع 14 و6 من القديم؛ بالكيكة 1 و1
    for (const parts of byLine.values()) for (const p of parts) expect(p.qty % 10).toBe(0);
    expect(byLine.get("swf")!.reduce((s, x) => s + x.qty, 0)).toBe(40);
    expect(byLine.get("jbh")!.reduce((s, x) => s + x.qty, 0)).toBe(20);
  });

  it("falls back to pieces when a batch holds a broken cake", () => {
    const { short } = fairAllocate(
      [batch("2026-10-24", 15), batch("2026-10-25", 5)],
      [{ key: "a", qty: 20 }],
      10,
    );
    expect(short).toBe(0);
  });

  it("reports what is short and skips empty lines", () => {
    const { byLine, short } = fairAllocate(
      [batch("2026-10-25", 10)],
      [
        { key: "a", qty: 8 },
        { key: "b", qty: 0 },
        { key: "c", qty: 8 },
      ],
    );
    expect(short).toBe(6);
    expect(byLine.get("b")).toEqual([]);
    expect(byLine.get("a")![0].qty + byLine.get("c")![0].qty).toBe(10);
  });
});

describe("orderTarget", () => {
  it("prefers the usual consumption, then par", () => {
    expect(orderTarget(35, 20)).toBe(35);
    expect(orderTarget(0, 20)).toBe(0);
    expect(orderTarget(null, 20)).toBe(20);
    expect(orderTarget(null, null)).toBeUndefined();
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
