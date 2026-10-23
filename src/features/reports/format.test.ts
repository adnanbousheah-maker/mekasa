import { describe, expect, it } from "vitest";
import { addDays, cakesLabel, parseRange, percent, rangeStart, toCakes, totalCakesAndPieces } from "./format";

describe("totalCakesAndPieces", () => {
  it("splits each product by its own size, then adds up", () => {
    expect(
      totalCakesAndPieces([
        { qty: 35, piecesPerCake: 10 },
        { qty: 17, piecesPerCake: 8 },
        { qty: 7, piecesPerCake: null },
        { qty: -3, piecesPerCake: 10 },
      ]),
    ).toEqual({ cakes: 5, pieces: 5 + 1 + 7 });
  });
});

describe("cakesLabel and toCakes", () => {
  it("rounds to one decimal and picks the word", () => {
    expect(cakesLabel(17)).toBe("17 كيكة");
    expect(cakesLabel(4)).toBe("4 كيكات");
    expect(cakesLabel(2.46)).toBe("2.5 كيكة");
    expect(toCakes(25, 10)).toBe(2.5);
    expect(toCakes(5, null)).toBe(0);
  });
});

describe("ranges", () => {
  it("defaults to the week", () => {
    expect(parseRange("today")).toBe("today");
    expect(parseRange("month")).toBe("month");
    expect(parseRange(undefined)).toBe("week");
    expect(parseRange("x")).toBe("week");
  });

  it("starts the week on Saturday", () => {
    // الجمعة 23 أكتوبر 2026 ← السبت 17
    expect(rangeStart("week", "2026-10-23")).toBe("2026-10-17");
    expect(rangeStart("week", "2026-10-17")).toBe("2026-10-17");
    expect(rangeStart("month", "2026-10-23")).toBe("2026-10-01");
    expect(rangeStart("today", "2026-10-23")).toBe("2026-10-23");
  });

  it("adds days across months", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});

describe("percent", () => {
  it("has one decimal and no base means null", () => {
    expect(percent(14, 340)).toBe(4.1);
    expect(percent(1, 0)).toBeNull();
  });
});
