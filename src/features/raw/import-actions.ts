"use server";

import ExcelJS from "exceljs";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { parseImportRows, type ExistingMaterial, type ImportError, type ImportRow } from "./import";

export type ImportPreview =
  { status: "error"; message: string } | { status: "preview"; rows: ImportRow[]; errors: ImportError[] };

const MAX_BYTES = 2 * 1024 * 1024;

// قيمة الخلية بأي شكل بيرجعه exceljs (نص، رقم، نص منسق، معادلة)
function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("result" in value) return value.result ?? null;
    if ("text" in value) return value.text;
    return null;
  }
  return value;
}

async function existingMaterials(): Promise<ExistingMaterial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("raw_materials")
    .select("code, name, base_unit, raw_material_units(unit_name, factor_to_base)");
  if (error) throw new Error(`Could not load raw materials: ${error.message}`);
  return data.map((m) => ({
    code: m.code,
    name: m.name,
    baseUnit: m.base_unit,
    units: m.raw_material_units.map((u) => ({ name: u.unit_name, factor: Number(u.factor_to_base) })),
  }));
}

/** بيقرأ الملف وبيرجع اللي رح ينحفظ، قبل التأكيد. */
export async function previewRawImportAction(formData: FormData): Promise<ImportPreview> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "اختار ملف Excel" };
  if (file.size > MAX_BYTES) return { status: "error", message: "الملف كبير. أقصى حجم 2MB" };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { status: "error", message: "ما قدرنا نقرأ الملف. لازم يكون .xlsx (متل القالب)" };
  }
  const ws = workbook.worksheets[0];
  if (!ws) return { status: "error", message: "الملف فاضي" };

  const cells: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, number) => {
    if (number === 1) return;
    cells[number - 2] = [1, 2, 3, 4].map((c) => cellValue(row.getCell(c).value));
  });
  const { rows, errors } = parseImportRows(
    Array.from(cells, (c) => c ?? []),
    await existingMaterials(),
  );
  if (rows.length === 0 && errors.length === 0) {
    return { status: "error", message: "ما في ولا سطر فيه كمية" };
  }
  return { status: "preview", rows, errors };
}

const rowsSchema = z
  .array(
    z.object({
      code: z.string().nullable(),
      name: z.string().min(1).max(80),
      packaging: z.object({
        unitName: z.string().max(20).nullable(),
        factor: z.number().positive(),
        baseUnit: z.string().min(1).max(20),
      }),
      qty: z.number().min(0),
    }),
  )
  .min(1)
  .max(500);

/** بيحفظ الجرد (وبيضيف المواد والتعبئات الجديدة) بخطوة وحدة بقاعدة البيانات. */
export async function confirmRawImportAction(
  rows: ImportRow[],
): Promise<{ status: "error"; message: string } | { status: "done"; count: number }> {
  await requireAdmin();
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) return { status: "error", message: "في سطر مش منطقي. ارفع الملف من جديد." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_import_raw_count", {
    p_rows: parsed.data.map((r) => ({
      code: r.code,
      name: r.name,
      base_unit: r.packaging.baseUnit,
      unit_name: r.packaging.unitName,
      factor: r.packaging.factor,
      qty: r.qty,
    })) as Json,
  });
  if (error) {
    console.error("importRawCount", error);
    const message =
      error.hint === "unit_factor_mismatch"
        ? "في تعبئة حجمها غير المسجل. ارفع الملف من جديد وشوف الأخطاء."
        : error.hint === "duplicate_material"
          ? "في مادة مكررة بالملف"
          : error.code === "23505"
            ? "في كود مستعمل لمادة ثانية"
            : "ما انحفظ الجرد. جرب كمان مرة.";
    return { status: "error", message };
  }
  refresh();
  return { status: "done", count: parsed.data.length };
}
