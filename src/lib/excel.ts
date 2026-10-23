import ExcelJS from "exceljs";

export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  width?: number;
}

export interface ExcelSheet<T> {
  name: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

/** بيخلي TypeScript يعرف نوع الصفوف من `rows` لكل الأعمدة. */
export function sheet<T>(definition: ExcelSheet<T>): ExcelSheet<T> {
  return definition;
}

/** ملف Excel من اليمين لليسار، بعنوان عريض لكل عمود. كل جدول بلوحة الأدمن بيتصدر بهالشكل. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- أوراق بأنواع صفوف مختلفة
export async function buildWorkbook(sheets: ExcelSheet<any>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mekasa";
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31), {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    });
    ws.columns = sheet.columns.map((c, i) => ({ key: String(i), header: c.header, width: c.width ?? 16 }));
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      ws.addRow(sheet.columns.map((c) => c.value(row) ?? ""));
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function excelResponse(buffer: Buffer, name: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
