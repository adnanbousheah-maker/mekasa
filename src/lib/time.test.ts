import { describe, expect, it } from "vitest";
import { businessDate, formatClock, formatLongDate } from "./time";

describe("businessDate", () => {
  it("uses Amman time, not UTC", () => {
    expect(businessDate(new Date("2026-10-22T21:30:00Z"))).toBe("2026-10-23");
  });

  it("stays on the same day just before Amman midnight", () => {
    expect(businessDate(new Date("2026-10-22T20:59:00Z"))).toBe("2026-10-22");
  });
});

describe("formatClock", () => {
  it("formats Amman time without a leading zero", () => {
    expect(formatClock(new Date("2026-10-23T06:21:00Z"))).toBe("9:21");
  });

  it("uses 24-hour time in the evening", () => {
    expect(formatClock(new Date("2026-10-23T18:00:00Z"))).toBe("21:00");
  });

  it("shows midnight as 0:00", () => {
    expect(formatClock(new Date("2026-10-22T21:00:00Z"))).toBe("0:00");
  });
});

describe("formatLongDate", () => {
  it("formats weekday, day and month like the design", () => {
    expect(formatLongDate("2026-10-23")).toBe("الجمعة 23 أكتوبر");
  });

  it("handles single-digit days", () => {
    expect(formatLongDate("2026-11-01")).toBe("الأحد 1 نوفمبر");
  });
});
