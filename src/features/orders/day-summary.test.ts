import { describe, expect, it } from "vitest";
import { shiftDate, summarizeDay } from "./day-summary";

const products = [
  { id: "flan", nameEn: "Flan", piecesPerCake: 10 },
  { id: "latte", nameEn: "Latte", piecesPerCake: 10 },
  { id: "tira", nameEn: "Tiramisu", piecesPerCake: null },
];

describe("summarizeDay", () => {
  it("adds up every branch's requests per product, in menu order", () => {
    const s = summarizeDay(
      [
        { branchId: "swf", branchName: "الصويفية", productId: "tira", qtyPieces: 6 },
        { branchId: "swf", branchName: "الصويفية", productId: "flan", qtyPieces: 30 },
        { branchId: "jbh", branchName: "الجبيهة", productId: "flan", qtyPieces: 20 },
        { branchId: "swf", branchName: "الصويفية", productId: "flan", qtyPieces: 10 },
        { branchId: "jbh", branchName: "الجبيهة", productId: "latte", qtyPieces: 0 },
      ],
      products,
      3,
    );
    expect(s.branches.map((b) => b.id)).toEqual(["swf", "jbh"]);
    expect(s.rows.map((r) => [r.product.id, r.total])).toEqual([
      ["flan", 60],
      ["tira", 6],
    ]);
    expect(s.rows[0].byBranch.get("swf")).toBe(40);
    expect(s.requests).toBe(3);
  });
});

describe("shiftDate", () => {
  it("moves across months", () => {
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
  });
});
