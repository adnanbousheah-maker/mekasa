import { describe, expect, it } from "vitest";
import {
  countWord,
  formatQuantity,
  formatQuantityCompact,
  resolvePiecesPerCake,
  splitPieces,
  toPieces,
} from "./units";

describe("toPieces", () => {
  it("converts whole cakes plus loose pieces into pieces", () => {
    expect(toPieces({ wholeCakes: 3, loosePieces: 5 }, 10)).toBe(35);
  });

  it("uses the product's own pieces per cake", () => {
    expect(toPieces({ wholeCakes: 2, loosePieces: 1 }, 8)).toBe(17);
  });

  it("accepts more loose pieces than one cake holds (cut cakes)", () => {
    expect(toPieces({ wholeCakes: 2, loosePieces: 15 }, 10)).toBe(35);
  });

  it("rejects negative or fractional counts", () => {
    expect(() => toPieces({ wholeCakes: -1, loosePieces: 0 }, 10)).toThrow(RangeError);
    expect(() => toPieces({ wholeCakes: 1.5, loosePieces: 0 }, 10)).toThrow(RangeError);
    expect(() => toPieces({ wholeCakes: 0, loosePieces: -2 }, 10)).toThrow(RangeError);
  });

  it("rejects pieces per cake below 1", () => {
    expect(() => toPieces({ wholeCakes: 1, loosePieces: 0 }, 0)).toThrow(RangeError);
  });
});

describe("splitPieces", () => {
  it("splits pieces into whole cakes and remaining pieces", () => {
    expect(splitPieces(35, 10)).toEqual({ cakes: 3, pieces: 5 });
  });

  it("returns zero cakes when under one cake", () => {
    expect(splitPieces(7, 8)).toEqual({ cakes: 0, pieces: 7 });
  });

  it("rejects negative totals", () => {
    expect(() => splitPieces(-1, 10)).toThrow(RangeError);
  });
});

describe("resolvePiecesPerCake", () => {
  it("uses the product override when set", () => {
    expect(resolvePiecesPerCake(8, 10)).toBe(8);
  });

  it("falls back to the global default", () => {
    expect(resolvePiecesPerCake(null, 10)).toBe(10);
  });
});

describe("countWord", () => {
  it.each([
    [0, "كيكات"],
    [1, "كيكة"],
    [2, "كيكة"],
    [3, "كيكات"],
    [10, "كيكات"],
    [11, "كيكة"],
    [33, "كيكة"],
    [100, "كيكة"],
    [103, "كيكات"],
  ])("uses the right cake word for %i", (n, word) => {
    expect(countWord(n, "cake")).toBe(word);
  });

  it.each([
    [1, "قطعة"],
    [5, "قطع"],
    [86, "قطعة"],
  ])("uses the right piece word for %i", (n, word) => {
    expect(countWord(n, "piece")).toBe(word);
  });
});

describe("formatQuantity", () => {
  it("shows cakes and pieces together", () => {
    expect(formatQuantity(35, 10)).toBe("3 كيكات + 5 قطع");
  });

  it("omits pieces when there are none", () => {
    expect(formatQuantity(30, 10)).toBe("3 كيكات");
  });

  it("shows only pieces when under one cake", () => {
    expect(formatQuantity(5, 10)).toBe("5 قطع");
  });

  it("shows pieces only for piece-only products", () => {
    expect(formatQuantity(24, null)).toBe("24 قطعة");
  });

  it("shows zero in cakes for cake products and pieces otherwise", () => {
    expect(formatQuantity(0, 10)).toBe("0 كيكات");
    expect(formatQuantity(0, null)).toBe("0 قطع");
  });

  it("marks negative stock with a minus sign", () => {
    expect(formatQuantity(-35, 10)).toBe("−3 كيكات + 5 قطع");
  });
});

describe("formatQuantityCompact", () => {
  it("uses the short table form", () => {
    expect(formatQuantityCompact(35, 10)).toBe("3 ك · 5 ق");
  });

  it("shows pieces only for piece-only products", () => {
    expect(formatQuantityCompact(12, null)).toBe("12 ق");
  });

  it("marks negative stock with a minus sign", () => {
    expect(formatQuantityCompact(-12, null)).toBe("−12 ق");
  });
});
