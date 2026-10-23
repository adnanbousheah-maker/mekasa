import "server-only";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formCode, sameProducts } from "./labels";

export interface PrintableForm {
  locationName: string;
  code: string;
  rows: { n: number; nameEn: string; nameAr: string | null; piecesOnly: boolean }[];
}

/**
 * الفورم للطباعة. إذا الأصناف الفعّالة تغيرت عن آخر نسخة، بتنعمل نسخة جديدة
 * (الفورمات القديمة المطبوعة بتضل تنقرأ صح بنسختها).
 */
export async function preparePrintableForm(locationId: string): Promise<PrintableForm | null> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [
    { data: location, error: locError },
    { data: products, error: prodError },
    { data: last, error: lastError },
  ] = await Promise.all([
    supabase.from("locations").select("id, name, code, kind").eq("id", locationId).maybeSingle(),
    supabase
      .from("v_products")
      .select("id, name_en, name_ar, sell_mode")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("count_form_versions")
      .select("version, product_ids")
      .eq("location_id", locationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (locError || prodError || lastError) throw new Error("Could not load the count form");
  if (!location || (location.kind !== "branch" && location.kind !== "factory")) return null;

  const ids = products.map((p) => p.id!);
  let version = last?.version ?? 0;
  if (!last || !sameProducts(last.product_ids, ids)) {
    version += 1;
    const { error } = await supabase
      .from("count_form_versions")
      .insert({ location_id: locationId, version, product_ids: ids, created_by: admin.id });
    // طباعتين بنفس اللحظة: الثانية بتلاقي النسخة جاهزة
    if (error && error.code !== "23505") throw new Error(`Could not save the form version: ${error.message}`);
  }

  return {
    locationName: location.kind === "branch" ? `فرع ${location.name}` : location.name,
    code: formCode(location.code, version),
    rows: products.map((p, i) => ({
      n: i + 1,
      nameEn: p.name_en!,
      nameAr: p.name_ar,
      piecesOnly: p.sell_mode === "pieces_only",
    })),
  };
}
