import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildWorkbook, excelResponse } from "./excel";

describe("buildWorkbook", () => {
  it("writes a right-to-left sheet with headers and rows", async () => {
    const buffer = await buildWorkbook([
      {
        name: "الستوك",
        columns: [
          { header: "الصنف", value: (r: { name: string; qty: number | null }) => r.name },
          { header: "الكمية", value: (r) => r.qty, width: 10 },
        ],
        rows: [
          { name: "Flan", qty: 12 },
          { name: "Latte", qty: null },
        ],
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = workbook.getWorksheet("الستوك")!;
    expect(ws.views[0].rightToLeft).toBe(true);
    expect(ws.getRow(1).values).toEqual([undefined, "الصنف", "الكمية"]);
    expect(ws.getRow(2).values).toEqual([undefined, "Flan", 12]);
    expect(ws.getRow(3).getCell(2).value).toBe("");
  });
});

describe("excelResponse", () => {
  it("is a downloadable attachment", () => {
    const response = excelResponse(Buffer.from("x"), "mekasa-stock");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="mekasa-stock.xlsx"');
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml");
  });
});

describe("sheet", () => {
  it("returns the definition unchanged", async () => {
    const { sheet } = await import("./excel");
    const definition = { name: "x", columns: [], rows: [1] };
    expect(sheet(definition)).toBe(definition);
  });
});
