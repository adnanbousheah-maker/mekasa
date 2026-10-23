import { describe, expect, it } from "vitest";
import { lateLabel, pendingAlerts, slotStatus, slotTime } from "./slots";

const settings = { reminderMinutesBefore: 10, lateAfterMinutes: 15 };
const at = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00+03:00`);

describe("slotTime", () => {
  it("is the schedule time today in Amman", () => {
    expect(slotTime("2026-10-23", "09:00:00").toISOString()).toBe("2026-10-23T06:00:00.000Z");
  });
});

describe("slotStatus", () => {
  const slot = at("09:00");
  it("goes upcoming → due → late, and done wins", () => {
    expect(slotStatus(slot, at("08:49"), false, settings)).toBe("upcoming");
    expect(slotStatus(slot, at("08:50"), false, settings)).toBe("due");
    expect(slotStatus(slot, at("09:14"), false, settings)).toBe("due");
    expect(slotStatus(slot, at("09:15"), false, settings)).toBe("late");
    expect(slotStatus(slot, at("09:30"), true, settings)).toBe("done");
  });
});

describe("lateLabel", () => {
  it("speaks like the design", () => {
    expect(lateLabel(at("09:00"), at("09:15"))).toBe("متأخر 15 دقيقة");
    expect(lateLabel(at("09:00"), at("09:05"))).toBe("متأخر 5 دقايق");
    expect(lateLabel(at("09:00"), at("10:00"))).toBe("متأخر ساعة");
    expect(lateLabel(at("09:00"), at("11:10"))).toBe("متأخر ساعتين و10 دقيقة");
    expect(lateLabel(at("09:00"), at("12:00"))).toBe("متأخر 3 ساعات");
    expect(lateLabel(at("09:00"), at("08:00"))).toBe("متأخر 0 دقيقة");
  });
});

describe("pendingAlerts", () => {
  const schedules = [
    { id: "a", locationId: "swf", timeOfDay: "09:00:00" },
    { id: "b", locationId: "swf", timeOfDay: "21:00:00" },
    { id: "c", locationId: "jbh", timeOfDay: "09:00:00" },
  ];

  it("reminds before the slot and warns when it is late, once each", () => {
    const due = pendingAlerts(schedules, "2026-10-23", at("08:55"), new Set(), new Set(), settings);
    expect(due.map((a) => [a.kind, a.schedule.id])).toEqual([
      ["count_reminder", "a"],
      ["count_reminder", "c"],
    ]);

    const late = pendingAlerts(
      schedules,
      "2026-10-23",
      at("09:20"),
      new Set(["c"]),
      new Set(["count_reminder:a"]),
      settings,
    );
    expect(late.map((a) => [a.kind, a.schedule.id])).toEqual([["count_late", "a"]]);

    const already = pendingAlerts(
      schedules,
      "2026-10-23",
      at("09:20"),
      new Set(["c"]),
      new Set(["count_late:a"]),
      settings,
    );
    expect(already).toEqual([]);
  });

  it("ignores slots that passed more than two hours ago", () => {
    expect(
      pendingAlerts(schedules.slice(0, 1), "2026-10-23", at("11:30"), new Set(), new Set(), settings),
    ).toEqual([]);
  });
});
