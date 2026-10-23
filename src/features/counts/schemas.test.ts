import { describe, expect, it } from "vitest";
import { correctionSchema, countTotals, submitCountSchema, toRpcLines } from "./schemas";

const productId = "11111111-1111-4111-8111-111111111111";

describe("submitCountSchema", () => {
  it("accepts a manual count with defaults", () => {
    const parsed = submitCountSchema.parse({
      scheduleId: null,
      startedAt: "2026-10-23T06:00:00.000Z",
      lines: [{ productId, wholeCakes: 3, loosePieces: 5 }],
    });
    expect(parsed.method).toBe("manual");
    expect(parsed.photoPath).toBeNull();
    expect(parsed.formVersionId).toBeNull();
  });

  it("rejects negative, fractional and absurd numbers", () => {
    for (const wholeCakes of [-1, 1.5, 1000]) {
      const result = submitCountSchema.safeParse({
        scheduleId: null,
        startedAt: "2026-10-23T06:00:00.000Z",
        lines: [{ productId, wholeCakes, loosePieces: 0 }],
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects a bad start time or product id", () => {
    expect(submitCountSchema.safeParse({ scheduleId: null, startedAt: "yesterday", lines: [] }).success).toBe(
      false,
    );
    expect(
      submitCountSchema.safeParse({
        scheduleId: null,
        startedAt: "2026-10-23T06:00:00Z",
        lines: [{ productId: "x", wholeCakes: 0, loosePieces: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("toRpcLines", () => {
  it("maps to the database shape with nulls for missing values", () => {
    expect(
      toRpcLines([
        { productId, productionDate: "2026-10-22", wholeCakes: 4, loosePieces: 0 },
        {
          productId,
          wholeCakes: 1,
          loosePieces: 2,
          ocr: { wholeCakes: 1, loosePieces: 7, wholeConfidence: 0.99, piecesConfidence: 0.4 },
        },
      ]),
    ).toEqual([
      {
        product_id: productId,
        production_date: "2026-10-22",
        whole_cakes: 4,
        loose_pieces: 0,
        ocr_whole_cakes: null,
        ocr_loose_pieces: null,
        ocr_whole_confidence: null,
        ocr_pieces_confidence: null,
      },
      {
        product_id: productId,
        production_date: null,
        whole_cakes: 1,
        loose_pieces: 2,
        ocr_whole_cakes: 1,
        ocr_loose_pieces: 7,
        ocr_whole_confidence: 0.99,
        ocr_pieces_confidence: 0.4,
      },
    ]);
  });
});

describe("countTotals", () => {
  it("adds cakes and pieces separately", () => {
    expect(
      countTotals([
        { wholeCakes: 3, loosePieces: 5 },
        { wholeCakes: 0, loosePieces: 7 },
      ]),
    ).toEqual({ cakes: 3, pieces: 12 });
    expect(countTotals([])).toEqual({ cakes: 0, pieces: 0 });
  });
});

describe("correctionSchema", () => {
  it("needs a reason of at least 3 characters", () => {
    const result = correctionSchema.safeParse({
      lineId: productId,
      wholeCakes: 1,
      loosePieces: 0,
      reason: " x ",
    });
    expect(result.error?.issues[0]?.message).toBe("اكتب سبب التعديل (3 أحرف على الأقل)");
    expect(
      correctionSchema.parse({ lineId: productId, wholeCakes: 1, loosePieces: 0, reason: " غلط بالعد " })
        .reason,
    ).toBe("غلط بالعد");
  });
});
