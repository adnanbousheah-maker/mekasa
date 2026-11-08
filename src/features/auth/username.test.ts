import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";
import { loginIdentifier, normalizeUsername } from "./username";

describe("normalizeUsername", () => {
  it("lowercases and trims a valid name", () => {
    expect(normalizeUsername("  Ahmad.K ")).toBe("ahmad.k");
    expect(normalizeUsername("rana_2")).toBe("rana_2");
  });

  it("refuses short, Arabic, spaced or digit-first names", () => {
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("أحمد")).toBeNull();
    expect(normalizeUsername("ahmad k")).toBeNull();
    expect(normalizeUsername("1ahmad")).toBeNull();
    expect(normalizeUsername("a".repeat(31))).toBeNull();
  });
});

describe("loginIdentifier", () => {
  it("prefers a phone number", () => {
    expect(loginIdentifier("079 000 0001", normalizePhone)).toBe("962790000001");
  });

  it("falls back to a username", () => {
    expect(loginIdentifier("Admin", normalizePhone)).toBe("admin");
    expect(loginIdentifier("!!", normalizePhone)).toBeNull();
  });
});
