import { describe, expect, it } from "vitest";
import { treeOrder, usableOptions } from "./types";

const o = (id: string, sortOrder: number, parentId: string | null = null) => ({
  id,
  name: id,
  sortOrder,
  parentId,
});

describe("treeOrder", () => {
  it("puts each sub-option under its main one, in order", () => {
    expect(
      treeOrder([o("b", 2), o("a", 1), o("a2", 2, "a"), o("a1", 1, "a")]).map((x) => [x.id, x.depth]),
    ).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a2", 1],
      ["b", 0],
    ]);
  });

  it("shows an orphan as a main option", () => {
    expect(treeOrder([o("x", 1, "gone")]).map((x) => x.depth)).toEqual([0]);
  });
});

describe("usableOptions", () => {
  const opts = [
    { id: "all", isActive: true, allowedRoles: null },
    { id: "off", isActive: false, allowedRoles: null },
    { id: "factory", isActive: true, allowedRoles: ["storekeeper"] },
  ];
  it("keeps active options open to the staff member's roles", () => {
    expect(usableOptions(opts, ["branch_staff"]).map((x) => x.id)).toEqual(["all"]);
    expect(usableOptions(opts, ["storekeeper"]).map((x) => x.id)).toEqual(["all", "factory"]);
    expect(usableOptions(opts, ["admin"]).map((x) => x.id)).toEqual(["all", "factory"]);
  });
});
