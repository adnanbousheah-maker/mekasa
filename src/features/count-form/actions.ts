"use server";

import { requireStaff } from "@/features/auth/session";
import type { CountProduct } from "@/features/counts/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { mapOcrRows, parseFormCode, type ReadLine } from "./labels";
import { OCR_MODEL, readCountFormImage } from "./ocr";

export type ReadFormResult =
  | { status: "error"; message: string }
  | { status: "done"; formVersionId: string; products: CountProduct[]; lines: ReadLine[]; unsure: number };

const MANUAL_HINT = "اكبس «أدخل يدوي» وكمّل الجرد من غير صورة.";

/**
 * قراءة صورة الفورم اللي انرفعت لمجلد موقع الموظف. النسخة من الرمز المكتوب تحت الـ QR،
 * وإذا ما انقرأ (أو لموقع ثاني) آخر نسخة لموقع الموظف.
 */
export async function readCountFormAction(photoPath: string): Promise<ReadFormResult> {
  const staff = await requireStaff();
  const location = staff.location;
  if (!location || location.kind !== "branch") return { status: "error", message: "الجرد بالصورة للفروع" };
  if (!photoPath.startsWith(`${location.id}/`) || photoPath.includes("..")) {
    return { status: "error", message: "الصورة مش لموقعك" };
  }

  const supabase = await createClient();
  const [
    { data: file, error: fileError },
    { data: versions, error: versionError },
    { data: loc },
    { data: products },
  ] = await Promise.all([
    supabase.storage.from("count-photos").download(photoPath),
    supabase
      .from("count_form_versions")
      .select("id, version, product_ids")
      .eq("location_id", location.id)
      .order("version", { ascending: false }),
    supabase.from("locations").select("code").eq("id", location.id).single(),
    supabase
      .from("v_products")
      .select(
        "id, name_en, name_ar, sell_mode, is_active, effective_pieces_per_cake, effective_shelf_life_days",
      )
      .eq("kind", "cake"),
  ]);
  if (fileError || !file) return { status: "error", message: "ما لقينا الصورة. صوّر كمان مرة." };
  if (versionError || !versions?.length)
    return { status: "error", message: `ما في فورم مطبوع لموقعك. ${MANUAL_HINT}` };

  const mediaType =
    (["image/jpeg", "image/png", "image/webp"] as const).find((t) => t === file.type) ?? "image/jpeg";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const latest = versions[0];
  const started = Date.now();
  const log = createAdminClient();

  let read: Awaited<ReturnType<typeof readCountFormImage>>;
  try {
    read = await readCountFormImage({ base64, mediaType }, latest.product_ids.length);
  } catch (error) {
    console.error("readCountForm", error);
    await log.from("ai_usage_log").insert({
      feature: "count_ocr",
      staff_id: staff.id,
      model: OCR_MODEL,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      duration_ms: Date.now() - started,
    });
    return { status: "error", message: `ما قدرنا نقرأ الصورة. ${MANUAL_HINT}` };
  }

  await log.from("ai_usage_log").insert({
    feature: "count_ocr",
    staff_id: staff.id,
    model: read.usage.model,
    input_tokens: read.usage.inputTokens,
    output_tokens: read.usage.outputTokens,
    raw_response: read.usage.raw as Json,
    duration_ms: Date.now() - started,
  });

  if (!read.result.isCountForm) {
    return { status: "error", message: "الصورة مش فورم جرد. صوّر الفورم كله جوا الإطار." };
  }

  const code = parseFormCode(read.result.formCode);
  const version =
    (code && code.locationCode === loc?.code && versions.find((v) => v.version === code.version)) || latest;
  const all = products ?? [];
  const piecesOnly = new Set(all.filter((p) => p.sell_mode === "pieces_only").map((p) => p.id!));
  const readLines = mapOcrRows(read.result.rows, version.product_ids, piecesOnly);
  // أصناف انضافت بعد طباعة الفورم: صفر، وبحاجة تأكيد
  const added = all.filter((p) => p.is_active && !version.product_ids.includes(p.id!));
  const lines: ReadLine[] = [
    ...readLines,
    ...added.map((p) => ({
      productId: p.id!,
      wholeCakes: 0,
      loosePieces: 0,
      unsure: true,
      ocr: { wholeCakes: null, loosePieces: null, wholeConfidence: 0, piecesConfidence: 0 },
    })),
  ];
  const byId = new Map(all.map((p) => [p.id!, p]));
  const formProducts: CountProduct[] = lines.flatMap((l) => {
    const p = byId.get(l.productId);
    return p
      ? [
          {
            id: p.id!,
            nameEn: p.name_en!,
            nameAr: p.name_ar,
            piecesPerCake: p.effective_pieces_per_cake,
            shelfLifeDays: p.effective_shelf_life_days ?? 7,
          },
        ]
      : [];
  });
  return {
    status: "done",
    formVersionId: version.id,
    products: formProducts,
    lines,
    unsure: lines.filter((l) => l.unsure).length,
  };
}
