import { describe, expect, it } from "vitest";
import { change, resolvePeriod, wasteShare } from "./period";

// الأحد 8 نوفمبر 2026 = يوم 2، فالأسبوع بلش السبت 7 نوفمبر
const today = "2026-11-08";

describe("resolvePeriod", () => {
  it("starts the week on Saturday and compares with the same days before", () => {
    expect(resolvePeriod(today, "week")).toMatchObject({
      from: "2026-11-07",
      to: today,
      days: 2,
      previous: { from: "2026-11-05", to: "2026-11-06" },
    });
  });

  it("knows last week, this month and last month", () => {
    expect(resolvePeriod(today, "last-week")).toMatchObject({
      from: "2026-10-31",
      to: "2026-11-06",
      days: 7,
    });
    expect(resolvePeriod(today, "month")).toMatchObject({ from: "2026-11-01", to: today, days: 8 });
    expect(resolvePeriod(today, "last-month")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      days: 31,
      previous: { from: "2026-08-31", to: "2026-09-30" },
    });
    expect(resolvePeriod(today, "30d")).toMatchObject({ from: "2026-10-10", days: 30 });
  });

  it("takes a sensible custom range and falls back to this week otherwise", () => {
    expect(resolvePeriod(today, "custom", "2026-10-01", "2026-10-10")).toMatchObject({
      preset: "custom",
      days: 10,
    });
    expect(resolvePeriod(today, "custom", "2026-10-10", "2026-10-01").preset).toBe("week");
    expect(resolvePeriod(today, "custom", "2026-10-01", "2026-12-01").preset).toBe("week");
    expect(resolvePeriod(today, "nonsense").preset).toBe("week");
  });
});

describe("change and wasteShare", () => {
  it("compares with the period before", () => {
    expect(change(120, 100)).toBe(20);
    expect(change(80, 100)).toBe(-20);
    expect(change(5, 0)).toBeNull();
  });

  it("gives waste as a share of consumption plus waste", () => {
    expect(wasteShare(97, 3)).toBe(3);
    expect(wasteShare(0, 0)).toBeNull();
    // تالف بدون استهلاك محسوب: ما في نسبة
    expect(wasteShare(0, 4)).toBeNull();
  });
});
