import { describe, expect, it } from "vitest";
import { scheduleLabel, templateSchema } from "./logic";

describe("scheduleLabel", () => {
  it("describes how often a task comes", () => {
    expect(scheduleLabel({ frequency: "daily", weekdays: null, monthDay: null })).toBe("كل يوم");
    expect(scheduleLabel({ frequency: "weekly", weekdays: [4, 1], monthDay: null })).toBe("السبت والثلاثاء");
    expect(scheduleLabel({ frequency: "monthly", weekdays: null, monthDay: 1 })).toBe("يوم 1 بالشهر");
    expect(scheduleLabel({ frequency: "monthly", weekdays: null, monthDay: 31 })).toBe("آخر يوم بالشهر");
  });
});

describe("templateSchema", () => {
  const base = {
    title: "نظّف الثلاجة",
    description: "",
    locationIds: [],
    role: "branch_staff" as const,
    frequency: "daily" as const,
    weekdays: [],
    monthDay: null,
    dueTime: "09:00",
    requiresPhoto: true,
  };
  it("cleans a daily task for every branch", () => {
    expect(templateSchema.parse(base)).toMatchObject({ description: null, locationIds: null });
  });
  it("needs days for weekly and a day for monthly", () => {
    expect(templateSchema.safeParse({ ...base, frequency: "weekly" }).error?.issues[0]?.message).toBe(
      "اختار يوم واحد على الأقل",
    );
    expect(templateSchema.safeParse({ ...base, frequency: "monthly" }).success).toBe(false);
    expect(templateSchema.safeParse({ ...base, dueTime: "25:00" }).success).toBe(false);
  });
});
