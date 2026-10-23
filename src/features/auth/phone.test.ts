import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["079 123 4567", "962791234567"],
    ["0791234567", "962791234567"],
    ["+962 79 123 4567", "962791234567"],
    ["962781234567", "962781234567"],
    ["00962771234567", "962771234567"],
    ["791234567", "962791234567"],
    ["٠٧٩١٢٣٤٥٦٧", "962791234567"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "0761234567", "079123456", "07912345678", "0791234abc", "+1 555 123 4567"])(
    "rejects %s",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("formatPhone", () => {
  it("shows the local form people know", () => {
    expect(formatPhone("962791234567")).toBe("079 123 4567");
  });
});

describe("maskPhone", () => {
  it("hides the middle digits like the staff table design", () => {
    expect(maskPhone("962791234567")).toBe("079 ••• 4567");
  });
});
