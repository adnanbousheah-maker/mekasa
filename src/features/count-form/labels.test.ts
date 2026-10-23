import { describe, expect, it } from "vitest";
import { formCode, mapOcrRows, parseFormCode, sameProducts } from "./labels";

describe("form codes", () => {
  it("round-trips the printed code", () => {
    expect(formCode("SWF", 3)).toBe("SWF-COUNT-v3");
    expect(parseFormCode("SWF-COUNT-v3")).toEqual({ locationCode: "SWF", version: 3 });
  });

  it("tolerates case and spaces from the photo", () => {
    expect(parseFormCode(" swf - count - v12 ")).toEqual({ locationCode: "SWF", version: 12 });
  });

  it("rejects anything else", () => {
    expect(parseFormCode("hello")).toBeNull();
    expect(parseFormCode(null)).toBeNull();
    expect(parseFormCode("SWF-COUNT-")).toBeNull();
  });
});

describe("sameProducts", () => {
  it("compares ids in order", () => {
    expect(sameProducts(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameProducts(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameProducts(["a"], ["a", "b"])).toBe(false);
  });
});

describe("mapOcrRows", () => {
  const rows = [
    { row: 1, whole_cakes: 4, loose_pieces: 2, whole_confidence: 0.99, pieces_confidence: 0.97 },
    { row: 2, whole_cakes: 2, loose_pieces: 7, whole_confidence: 0.5, pieces_confidence: 0.95 },
    { row: 3, whole_cakes: 3, loose_pieces: null, whole_confidence: 0.9, pieces_confidence: 0.9 },
  ];

  it("maps rows to products by position and marks unsure numbers", () => {
    const lines = mapOcrRows(rows, ["choco", "red", "tiramisu", "flan"], new Set(["tiramisu"]));
    expect(lines.map((l) => [l.productId, l.wholeCakes, l.loosePieces, l.unsure])).toEqual([
      ["choco", 4, 2, false],
      ["red", 2, 7, true],
      // قطع بس: خانة الكيكات بتنتجاهل، والفاضي صفر
      ["tiramisu", 0, 0, false],
      // سطر ما انقرأ: صفر وبحاجة تأكيد
      ["flan", 0, 0, true],
    ]);
    expect(lines[2].ocr.wholeCakes).toBeNull();
    expect(lines[1].ocr).toEqual({
      wholeCakes: 2,
      loosePieces: 7,
      wholeConfidence: 0.5,
      piecesConfidence: 0.95,
    });
  });

  it("clamps impossible readings", () => {
    const [line] = mapOcrRows(
      [{ row: 1, whole_cakes: -3, loose_pieces: 5000, whole_confidence: 1, pieces_confidence: 1 }],
      ["choco"],
      new Set(),
    );
    expect([line.wholeCakes, line.loosePieces]).toEqual([0, 999]);
  });
});
