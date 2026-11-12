import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./canonical-host";

// التحويل من الرابط القديم موقوف مؤقتاً (canonical-host.ts): لما يرجع، رجّع فحص التحويل هون.
describe("canonicalRedirect", () => {
  it("does not redirect while the old address is kept as a fallback", () => {
    expect(canonicalRedirect("mekasa.vercel.app", "/admin/stock", "?q=1")).toBeNull();
  });

  it("leaves the official domain, previews and local alone", () => {
    expect(canonicalRedirect("inv.mekasajo.com", "/", "")).toBeNull();
    expect(canonicalRedirect("mekasa-abc123-team.vercel.app", "/", "")).toBeNull();
    expect(canonicalRedirect("localhost:3000", "/", "")).toBeNull();
    expect(canonicalRedirect(null, "/", "")).toBeNull();
  });
});
