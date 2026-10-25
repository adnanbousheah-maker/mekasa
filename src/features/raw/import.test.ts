import { describe, expect, it } from "vitest";
import {
  baseQuantity,
  packagingLabel,
  parseImportRows,
  parsePackaging,
  type ExistingMaterial,
} from "./import";

describe("parsePackaging", () => {
  it("reads a packaging with its size", () => {
    expect(parsePackaging("كيس 25 كيلو")).toEqual({ unitName: "كيس", factor: 25, baseUnit: "كيلو" });
    expect(parsePackaging("  كرتونة   ٣٠ حبة ")).toEqual({ unitName: "كرتونة", factor: 30, baseUnit: "حبة" });
    expect(parsePackaging("علبة 2.5 كيلو")).toEqual({ unitName: "علبة", factor: 2.5, baseUnit: "كيلو" });
  });

  it("reads the base unit alone", () => {
    expect(parsePackaging("كيلو")).toEqual({ unitName: null, factor: 1, baseUnit: "كيلو" });
  });

  it("rejects what it cannot read", () => {
    expect(parsePackaging("")).toBeNull();
    expect(parsePackaging("كيس كبير جداً")).toBeNull();
    expect(parsePackaging("كيس 0 كيلو")).toBeNull();
  });

  it("writes the same format for the template", () => {
    expect(packagingLabel("كيلو", { name: "كيس", factor: 25 })).toBe("كيس 25 كيلو");
    expect(packagingLabel("لتر")).toBe("لتر");
  });
});

describe("parseImportRows", () => {
  const existing: ExistingMaterial[] = [
    { code: "FL01", name: "طحين", baseUnit: "كيلو", units: [{ name: "كيس", factor: 25 }] },
    { code: null, name: "بيض", baseUnit: "حبة", units: [{ name: "كرتونة", factor: 30 }] },
  ];

  it("matches by code, then by name, and skips rows without a quantity", () => {
    const { rows, errors } = parseImportRows(
      [
        ["fl01", "Flour", "كيس 25 كيلو", 4],
        ["", "بيض", "كرتونة", "٢"],
        ["SU01", "سكر", "كيس 50 كيلو", ""],
      ],
      existing,
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.name, r.existing, r.packaging.unitName, r.qty, baseQuantity(r)])).toEqual([
      ["طحين", "طحين", "كيس", 4, 100],
      ["بيض", "بيض", "كرتونة", 2, 60],
    ]);
  });

  it("adds new materials and new packaging", () => {
    const { rows, errors } = parseImportRows(
      [
        ["SU01", "سكر", "كيس 50 كيلو", 3],
        ["FL01", "طحين", "شوال 50 كيلو", 1],
      ],
      existing,
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.name, r.existing, r.newUnit])).toEqual([
      ["سكر", null, true],
      ["طحين", "طحين", true],
    ]);
  });

  it("reports rows it cannot use, with their line in the file, and keeps the rest", () => {
    const { rows, errors } = parseImportRows(
      [
        ["FL01", "طحين", "كيس 20 كيلو", 1],
        ["", "زبدة", "علبة", 2],
        ["", "", "كيلو", "كثير"],
        ["FL01", "طحين", "كيلو", 5],
        ["", "بيض", "كيلو", 5],
        ["X Y", "شي", "كيلو", 1],
        ["", "بيض", "كرتونة كبيرة", 1],
        ["", "بيض", "", 90],
      ],
      [...existing],
    );
    // زبدة بعلبة = مادة جديدة وحدتها علبة، وطحين بالكيلو صح (السطر الأول فيه غلط فما انحسب)
    expect(rows.map((r) => [r.row, r.name])).toEqual([
      [3, "زبدة"],
      [5, "طحين"],
      [9, "بيض"],
    ]);
    // سطر 8: تعبئة مش مفهومة لمادة موجودة ما بتنحسب بالوحدة الأساسية بالغلط
    expect(errors.map((e) => e.row)).toEqual([2, 4, 6, 7, 8]);
    expect(errors[0].message).toContain("25");
  });

  it("refuses the same material twice", () => {
    const { errors } = parseImportRows(
      [
        ["FL01", "طحين", "كيلو", 5],
        ["", "طحين", "كيس 25 كيلو", 1],
      ],
      existing,
    );
    expect(errors).toEqual([{ row: 3, message: "المادة مكررة بالملف" }]);
  });
});
