import { describe, expect, it } from "vitest";
import { batchLabel, shortDate, usesDate } from "./batch-label";

describe("batch labels", () => {
  it("keeps day numbers up to a week, and dates after", () => {
    expect(usesDate(7)).toBe(false);
    expect(usesDate(8)).toBe(true);
    // 25 أكتوبر 2026 سبت = رقم 1
    expect(batchLabel("2026-10-24", 7)).toEqual({ kind: "day", day: 1, text: "رقم 1" });
    expect(batchLabel("2026-10-24", 14)).toEqual({ kind: "date", text: "24/10" });
  });

  it("writes short dates without leading zeros", () => {
    expect(shortDate("2026-01-05")).toBe("5/1");
  });
});
