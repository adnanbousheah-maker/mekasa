import { describe, expect, it } from "vitest";
import {
  formatScheduleTime,
  isNumberSetting,
  isToggleSetting,
  nameArSchema,
  newProductSchema,
  numberSettingSchema,
  piecesOverrideSchema,
  scheduleTimeSchema,
} from "./schemas";

describe("numberSettingSchema", () => {
  it("accepts whole numbers inside the database limits", () => {
    expect(numberSettingSchema("default_pieces_per_cake").parse("12")).toBe(12);
    expect(numberSettingSchema("factory_shelf_life_days").parse(" 7 ")).toBe(7);
    expect(numberSettingSchema("count_reminder_minutes_before").parse("0")).toBe(0);
    expect(numberSettingSchema("count_late_after_minutes").parse("240")).toBe(240);
  });

  it("accepts Arabic digits", () => {
    expect(numberSettingSchema("unreceived_alert_hours").parse("٣")).toBe(3);
    expect(numberSettingSchema("branch_shelf_life_days").parse("١٤")).toBe(14);
  });

  it("rejects values outside the limits with the range in the message", () => {
    const result = numberSettingSchema("factory_shelf_life_days").safeParse("8");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("اكتب رقم بين 1 و7");
    expect(numberSettingSchema("default_pieces_per_cake").safeParse("0").success).toBe(false);
    expect(numberSettingSchema("default_pieces_per_cake").safeParse("51").success).toBe(false);
    expect(numberSettingSchema("unreceived_alert_hours").safeParse("73").success).toBe(false);
    expect(numberSettingSchema("branch_shelf_life_days").safeParse("15").success).toBe(false);
    expect(numberSettingSchema("count_reminder_minutes_before").safeParse("121").success).toBe(false);
  });

  it("rejects empty, fractional, negative and non-numeric input", () => {
    for (const value of ["", "2.5", "-1", "ten", "1e2", "99999"]) {
      expect(numberSettingSchema("unreceived_alert_hours").safeParse(value).success).toBe(false);
    }
  });
});

describe("setting keys", () => {
  it("knows which keys are numbers and which are toggles", () => {
    expect(isNumberSetting("factory_shelf_life_days")).toBe(true);
    expect(isNumberSetting("returns_enabled")).toBe(false);
    expect(isNumberSetting("updated_by")).toBe(false);
    expect(isNumberSetting("toString")).toBe(false);
    expect(isToggleSetting("returns_enabled")).toBe(true);
    expect(isToggleSetting("default_pieces_per_cake")).toBe(false);
  });
});

describe("piecesOverrideSchema", () => {
  it("treats empty as the global value", () => {
    expect(piecesOverrideSchema.parse("")).toBeNull();
    expect(piecesOverrideSchema.parse("  ")).toBeNull();
  });

  it("accepts 1 to 50", () => {
    expect(piecesOverrideSchema.parse("8")).toBe(8);
    expect(piecesOverrideSchema.safeParse("0").success).toBe(false);
    expect(piecesOverrideSchema.safeParse("51").success).toBe(false);
  });
});

describe("nameArSchema", () => {
  it("trims and turns empty into null", () => {
    expect(nameArSchema.parse("  فلان  ")).toBe("فلان");
    expect(nameArSchema.parse("   ")).toBeNull();
  });

  it("rejects names longer than 80", () => {
    expect(nameArSchema.safeParse("أ".repeat(81)).success).toBe(false);
  });
});

describe("newProductSchema", () => {
  it("parses a whole-and-pieces product with its own size", () => {
    expect(
      newProductSchema.parse({
        nameEn: " Lotus ",
        nameAr: "لوتس",
        sellMode: "whole_and_pieces",
        piecesPerCake: "12",
      }),
    ).toEqual({ nameEn: "Lotus", nameAr: "لوتس", sellMode: "whole_and_pieces", piecesPerCake: 12 });
  });

  it("drops the cake size for pieces-only products", () => {
    expect(
      newProductSchema.parse({ nameEn: "Brownie", nameAr: "", sellMode: "pieces_only", piecesPerCake: "8" }),
    ).toEqual({ nameEn: "Brownie", nameAr: null, sellMode: "pieces_only", piecesPerCake: null });
  });

  it("needs a name and a sell mode", () => {
    const noName = newProductSchema.safeParse({
      nameEn: " ",
      nameAr: "",
      sellMode: "pieces_only",
      piecesPerCake: "",
    });
    expect(noName.error?.issues[0]?.message).toBe("اكتب اسم الصنف");

    const noMode = newProductSchema.safeParse({ nameEn: "X", nameAr: "", sellMode: "", piecesPerCake: "" });
    expect(noMode.error?.issues[0]?.message).toBe("اختار نوع الصنف");
  });
});

describe("schedule times", () => {
  it("normalizes to HH:MM", () => {
    expect(scheduleTimeSchema.parse("9:00")).toBe("09:00");
    expect(scheduleTimeSchema.parse("21:30")).toBe("21:30");
    expect(scheduleTimeSchema.parse("00:05")).toBe("00:05");
  });

  it("rejects impossible times", () => {
    for (const value of ["24:00", "9:60", "9", "", "9:00:00", "ab:cd"]) {
      expect(scheduleTimeSchema.safeParse(value).success).toBe(false);
    }
  });

  it("formats database times like the design", () => {
    expect(formatScheduleTime("09:00:00")).toBe("9:00");
    expect(formatScheduleTime("21:30:00")).toBe("21:30");
    expect(formatScheduleTime("00:15:00")).toBe("0:15");
  });
});
