import { describe, expect, it } from "vitest";
import { businessDate, formatClock, formatLastSeen, formatLongDate, greetingFor } from "./time";

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

describe("greetingFor", () => {
  it("says good morning before noon in Amman", () => {
    expect(greetingFor(new Date("2026-10-23T08:59:00Z"))).toBe("صباح الخير");
  });

  it("says good evening from noon in Amman", () => {
    expect(greetingFor(new Date("2026-10-23T09:00:00Z"))).toBe("مسا الخير");
  });
});

describe("formatLastSeen", () => {
  const now = new Date("2026-10-23T09:30:00Z"); // 12:30 بعمّان

  it("shows today with the time", () => {
    expect(formatLastSeen(new Date("2026-10-23T06:12:00Z"), now)).toBe("اليوم 9:12");
  });

  it("shows yesterday with the time", () => {
    expect(formatLastSeen(new Date("2026-10-22T18:40:00Z"), now)).toBe("أمس 21:40");
  });

  it("counts days for anything older", () => {
    expect(formatLastSeen(new Date("2026-10-20T06:00:00Z"), now)).toBe("قبل 3 أيام");
    expect(formatLastSeen(new Date("2026-10-11T06:00:00Z"), now)).toBe("قبل 12 يوم");
  });

  it("says never for someone who has not signed in", () => {
    expect(formatLastSeen(null, now)).toBe("ما دخل لسا");
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
