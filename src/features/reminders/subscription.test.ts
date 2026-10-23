import { describe, expect, it } from "vitest";
import { countReminderMessage, subscriptionSchema } from "./subscription";

const keys = { p256dh: "BNc", auth: "xyz" };

describe("subscriptionSchema", () => {
  it("accepts the known push services", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://db5p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/abc",
    ]) {
      expect(subscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
    }
  });

  it("rejects anything else (no internal addresses)", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/x",
      "https://169.254.169.254/latest",
      "https://evil.com/fcm.googleapis.com/",
    ]) {
      expect(subscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
    }
  });
});

describe("countReminderMessage", () => {
  it("writes the reminder and the late warning", () => {
    expect(countReminderMessage("count_reminder", "9:00", "فرع الصويفية")).toEqual({
      title: "جرد الساعة 9:00",
      body: "وقت جرد فرع الصويفية قرّب. افتح التطبيق وابدأ.",
      url: "/count",
      tag: "count-9:00",
    });
    expect(countReminderMessage("count_late", "9:00", "المصنع").title).toBe("جرد الساعة 9:00 متأخر");
  });
});
