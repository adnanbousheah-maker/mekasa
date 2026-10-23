import { describe, expect, it } from "vitest";
import { productionSchema, productionTotals } from "./logic";

const id = "11111111-1111-4111-8111-111111111111";

describe("productionSchema", () => {
  it("keeps only lines with something and needs one", () => {
    expect(
      productionSchema.parse({
        lines: [
          { productId: id, wholeCakes: 6, loosePieces: 0 },
          { productId: id, wholeCakes: 0, loosePieces: 0 },
        ],
      }).lines,
    ).toHaveLength(1);
    expect(productionSchema.safeParse({ lines: [] }).error?.issues[0]?.message).toBe("ما سجلت ولا صنف");
  });
});

describe("productionTotals", () => {
  it("adds every entry of the day", () => {
    expect(
      productionTotals([
        {
          production_lines: [
            { whole_cakes: 6, loose_pieces: 0 },
            { whole_cakes: 0, loose_pieces: 24 },
          ],
        },
        { production_lines: [{ whole_cakes: 4, loose_pieces: 0 }] },
      ]),
    ).toEqual({ cakes: 10, pieces: 24 });
  });
});
