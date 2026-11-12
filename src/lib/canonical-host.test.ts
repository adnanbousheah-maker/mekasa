import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./canonical-host";

describe("canonicalRedirect", () => {
  it("sends the old address to the official domain, same page", () => {
    expect(canonicalRedirect("mekasa.vercel.app", "/admin/stock", "?q=1")).toBe(
      "https://inv.mekasajo.com/admin/stock?q=1",
    );
    expect(canonicalRedirect("MEKASA.vercel.app", "/", "")).toBe("https://inv.mekasajo.com/");
  });

  it("leaves the official domain, previews and local alone", () => {
    expect(canonicalRedirect("inv.mekasajo.com", "/", "")).toBeNull();
    expect(canonicalRedirect("mekasa-abc123-team.vercel.app", "/", "")).toBeNull();
    expect(canonicalRedirect("localhost:3000", "/", "")).toBeNull();
    expect(canonicalRedirect(null, "/", "")).toBeNull();
  });
});
