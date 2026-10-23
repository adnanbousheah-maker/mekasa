import { describe, expect, it } from "vitest";
import { authEmailFor, derivePassword, generatePin, isWeakPin, pinLengthFor } from "./pin";

const PEPPER = "test-pepper-test-pepper-test-pepper-test-pepper";
const STAFF_ID = "11111111-0000-4000-8000-000000000001";

describe("pinLengthFor", () => {
  it("gives staff 4 digits and admins 6", () => {
    expect(pinLengthFor(["branch_staff"])).toBe(4);
    expect(pinLengthFor(["dispatcher", "storekeeper"])).toBe(4);
    expect(pinLengthFor(["admin"])).toBe(6);
    expect(pinLengthFor(["storekeeper", "admin"])).toBe(6);
  });
});

describe("isWeakPin", () => {
  it.each(["0000", "1111", "1234", "4321", "2345", "9876", "123456", "654321", "000000", "1212", "121212"])(
    "rejects %s",
    (pin) => {
      expect(isWeakPin(pin)).toBe(true);
    },
  );

  it.each(["2580", "7391", "482915", "1593"])("accepts %s", (pin) => {
    expect(isWeakPin(pin)).toBe(false);
  });
});

describe("generatePin", () => {
  it("generates digits of the requested length that are not weak", () => {
    for (let i = 0; i < 200; i++) {
      const pin = generatePin(4);
      expect(pin).toMatch(/^\d{4}$/);
      expect(isWeakPin(pin)).toBe(false);
    }
    expect(generatePin(6)).toMatch(/^\d{6}$/);
  });
});

describe("derivePassword", () => {
  it("is long, deterministic and URL-safe", () => {
    const a = derivePassword(PEPPER, STAFF_ID, "2580");
    expect(a).toBe(derivePassword(PEPPER, STAFF_ID, "2580"));
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("changes with the PIN, the staff member and the pepper", () => {
    const base = derivePassword(PEPPER, STAFF_ID, "2580");
    expect(derivePassword(PEPPER, STAFF_ID, "2581")).not.toBe(base);
    expect(derivePassword(PEPPER, "11111111-0000-4000-8000-000000000002", "2580")).not.toBe(base);
    expect(derivePassword(`${PEPPER}x`, STAFF_ID, "2580")).not.toBe(base);
  });

  it("refuses a short pepper", () => {
    expect(() => derivePassword("short", STAFF_ID, "2580")).toThrow();
  });
});

describe("authEmailFor", () => {
  it("builds a stable login email from the staff id", () => {
    expect(authEmailFor(STAFF_ID)).toBe(`${STAFF_ID}@staff.mekasa.local`);
  });
});
