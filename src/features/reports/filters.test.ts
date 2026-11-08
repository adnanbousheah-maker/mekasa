import { describe, expect, it } from "vitest";
import {
  applyRawFilter,
  applyStaffFilter,
  applyWasteFilter,
  countsFilter,
  matches,
  normalize,
  staffFilter,
  toQuery,
  wasteFilter,
} from "./filters";

const ID = "11111111-1111-4111-8111-111111111111";

describe("search text", () => {
  it("ignores case, hamza and taa marbuta", () => {
    expect(normalize("  أحمد  الكبيرة ")).toBe("احمد الكبيره");
    expect(matches("flan", "Flan Cake")).toBe(true);
    expect(matches("احمد", "أحمد")).toBe(true);
    expect(matches("", "anything")).toBe(true);
    expect(matches("x", null, undefined)).toBe(false);
  });

  it("writes only the active filters to the link", () => {
    expect(toQuery({ q: "flan", location: "", low: true, issues: false })).toBe("q=flan&low=1");
  });
});

describe("waste filter", () => {
  it("reads and cleans the link", () => {
    expect(wasteFilter(new URLSearchParams(`range=month&location=${ID}&q=fl&reason=انكسرت`))).toEqual({
      range: "month",
      location: ID,
      reason: "انكسرت",
      q: "fl",
      who: "",
    });
    expect(wasteFilter({ location: "not-an-id", range: "x" })).toMatchObject({ location: "", range: "week" });
  });

  it("filters by place, reason, person and product", () => {
    const rows = [
      { locationId: ID, reasonName: "انكسرت", productName: "Flan", recordedBy: "رنا", note: null },
      { locationId: "other", reasonName: "انتهت", productName: "Carrot", recordedBy: "أحمد", note: "وقعت" },
    ];
    expect(applyWasteFilter(rows, wasteFilter({ location: ID })).length).toBe(1);
    expect(applyWasteFilter(rows, wasteFilter({ q: "وقعت" }))[0].productName).toBe("Carrot");
    expect(applyWasteFilter(rows, wasteFilter({ who: "رنا", reason: "انكسرت" })).length).toBe(1);
  });
});

describe("counts filter", () => {
  it("only keeps valid dates and methods", () => {
    expect(countsFilter({ from: "2026-11-01", to: "bad", method: "photo", issues: "1" })).toEqual({
      location: "",
      from: "2026-11-01",
      to: "",
      method: "photo",
      issues: true,
      who: "",
    });
  });
});

describe("staff filter", () => {
  const staff = [
    {
      fullName: "رنا",
      phone: "962790000003",
      username: "rana",
      isActive: true,
      isLocked: false,
      location: { id: ID },
      roles: ["branch_staff"],
    },
    {
      fullName: "سامر",
      phone: "962790000005",
      username: null,
      isActive: false,
      isLocked: false,
      location: null,
      roles: ["dispatcher"],
    },
  ];
  it("searches name, username and phone", () => {
    expect(applyStaffFilter(staff, staffFilter({ q: "RANA" })).length).toBe(1);
    expect(applyStaffFilter(staff, staffFilter({ q: "0790000005" }))[0].fullName).toBe("سامر");
  });
  it("filters by place, role and status", () => {
    expect(applyStaffFilter(staff, staffFilter({ status: "inactive" }))[0].fullName).toBe("سامر");
    expect(applyStaffFilter(staff, staffFilter({ role: "branch_staff", location: ID })).length).toBe(1);
  });
});

describe("raw filter", () => {
  const raw = [
    { name: "طحين", code: "R01", categoryId: "sub", belowMin: true, isActive: true },
    { name: "سكر", code: "R02", categoryId: null, belowMin: false, isActive: true },
  ];
  it("searches name or code, low only, and a main category includes its subs", () => {
    expect(applyRawFilter(raw, { q: "r02", category: "", low: false }).length).toBe(1);
    expect(applyRawFilter(raw, { q: "", category: "", low: true })[0].name).toBe("طحين");
    expect(
      applyRawFilter(raw, { q: "", category: "main", low: false }, (id) => (id === "sub" ? "main" : null))
        .length,
    ).toBe(1);
  });
});
