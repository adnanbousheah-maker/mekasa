import { describe, expect, it } from "vitest";
import { productionSchema, productionTotals, splitFrozen } from "./logic";

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

describe("splitFrozen", () => {
  it("splits the total into fresh and frozen, never more frozen than made", () => {
    expect(splitFrozen(10, 3)).toEqual({ fresh: 7, frozen: 3 });
    expect(splitFrozen(4, 9)).toEqual({ fresh: 0, frozen: 4 });
    expect(splitFrozen(5, -1)).toEqual({ fresh: 5, frozen: 0 });
  });
});
