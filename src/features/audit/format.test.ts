import { describe, expect, it } from "vitest";
import { changesOf, itemName } from "./format";

describe("changesOf", () => {
  it("keeps only the fields that changed, with readable labels", () => {
    expect(
      changesOf(
        "update",
        { name_en: "Flan", is_active: true, updated_at: "a" },
        { name_en: "Flan Cake", is_active: true, updated_at: "b" },
      ),
    ).toEqual([{ field: "الاسم", from: "Flan", to: "Flan Cake" }]);
  });

  it("shows booleans and empties in Arabic", () => {
    expect(
      changesOf("update", { is_active: true, name_ar: null }, { is_active: false, name_ar: "فلان" }),
    ).toEqual([
      { field: "فعّال", from: "نعم", to: "لا" },
      { field: "الاسم الثاني", from: "—", to: "فلان" },
    ]);
  });

  it("lists the new values of an insert and skips empty ones", () => {
    expect(changesOf("insert", null, { role: "admin", note: null, id: "x" })).toEqual([
      { field: "الدور", from: "—", to: "admin" },
    ]);
  });
});

describe("itemName", () => {
  it("finds a name in the stored values", () => {
    expect(itemName({ full_name: "رنا" })).toBe("رنا");
    expect(itemName({ qty: 3 })).toBeNull();
  });
});
