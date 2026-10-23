import { describe, expect, it } from "vitest";
import { DAY_COLORS, DAY_NAMES, dayNumberOf, latestDateForDayNumber } from "./day-number";

describe("dayNumberOf", () => {
  it.each([
    ["2026-10-17", 1], // السبت
    ["2026-10-18", 2], // الأحد
    ["2026-10-19", 3],
    ["2026-10-20", 4],
    ["2026-10-21", 5],
    ["2026-10-22", 6],
    ["2026-10-23", 7], // الجمعة
    ["2026-10-24", 1], // السبت اللي بعده
  ])("gives %s the day number %i", (date, day) => {
    expect(dayNumberOf(date)).toBe(day);
  });

  it("rejects malformed dates", () => {
    expect(() => dayNumberOf("23/10/2026")).toThrow(RangeError);
    expect(() => dayNumberOf("2026-02-30")).toThrow(RangeError);
  });
});

describe("latestDateForDayNumber", () => {
  it("returns today when today has that number", () => {
    expect(latestDateForDayNumber(7, "2026-10-23")).toBe("2026-10-23");
  });

  it("returns the most recent past date with that number", () => {
    expect(latestDateForDayNumber(1, "2026-10-23")).toBe("2026-10-17");
    expect(latestDateForDayNumber(6, "2026-10-23")).toBe("2026-10-22");
  });

  it("crosses month boundaries", () => {
    expect(latestDateForDayNumber(7, "2026-11-02")).toBe("2026-10-30");
  });
});

describe("day labels", () => {
  it("keeps the fixed colors from CLAUDE.md", () => {
    expect(DAY_COLORS).toEqual({
      1: "#B42318",
      2: "#C2410C",
      3: "#A16207",
      4: "#15803D",
      5: "#0E7490",
      6: "#1D4ED8",
      7: "#7E22CE",
    });
  });

  it("names Saturday as 1 and Friday as 7", () => {
    expect(DAY_NAMES[1]).toBe("السبت");
    expect(DAY_NAMES[7]).toBe("الجمعة");
  });
});
