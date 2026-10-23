"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import {
  newMaterialSchema,
  rawCountSchema,
  rawMoveSchema,
  type NewMaterialInput,
  type RawCountInput,
  type RawMoveInput,
} from "./logic";

export type RawResult = { status: "error"; message: string } | { status: "done" };

const fail = (message: string): RawResult => ({ status: "error", message });

export async function recordRawMoveAction(input: RawMoveInput): Promise<RawResult> {
  await requireStaff();
  const parsed = rawMoveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "في معلومة ناقصة");
  const m = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_raw_movement", {
    p_material_id: m.materialId,
    p_kind: m.kind,
    p_qty: m.qty,
    p_unit_id: m.unitId ?? undefined,
    p_supplier_name: m.supplierName || undefined,
    p_invoice_photo_path: m.invoicePhotoPath ?? undefined,
  });
  if (error) {
    console.error("recordRawMove", error);
    return fail(error.code === "42501" ? "المواد الأولية لأمين المستودع" : "ما انحفظت الحركة. جرب كمان مرة.");
  }
  refresh();
  return { status: "done" };
}

export async function submitRawCountAction(input: RawCountInput): Promise<RawResult> {
  await requireStaff();
  const parsed = rawCountSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "في معلومة ناقصة");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_raw_count", {
    p_started_at: parsed.data.startedAt,
    p_lines: parsed.data.lines.map((l) => ({
      material_id: l.materialId,
      unit_id: l.unitId,
      qty: l.qty,
    })) as Json,
  });
  if (error) {
    console.error("submitRawCount", error);
    return fail("ما انحفظ الجرد. جرب كمان مرة.");
  }
  refresh();
  return { status: "done" };
}

// ─── الأدمن: المواد والتحويلات (RLS للأدمن، والتغييرات بسجل التعديلات) ───

export async function createMaterialAction(input: NewMaterialInput): Promise<RawResult> {
  await requireAdmin();
  const parsed = newMaterialSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "في معلومة ناقصة");
  const m = parsed.data;
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("raw_materials")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("raw_materials")
    .insert({
      name: m.name,
      base_unit: m.baseUnit,
      min_qty: m.minQty,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? "في مادة بنفس الاسم" : "ما انحفظت المادة");
  if (m.unitName && m.unitFactor) {
    const { error: unitError } = await supabase
      .from("raw_material_units")
      .insert({ material_id: data.id, unit_name: m.unitName, factor_to_base: m.unitFactor });
    if (unitError) return fail("انحفظت المادة بس التحويل لا. ضيفه من الجدول.");
  }
  refresh();
  return { status: "done" };
}

const idSchema = z.uuid();

export async function updateMaterialMinAction(materialId: string, value: string): Promise<RawResult> {
  await requireAdmin();
  const parsed = z.coerce
    .number()
    .min(0)
    .max(1_000_000)
    .safeParse(value.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
  if (!idSchema.safeParse(materialId).success || !parsed.success || value.trim() === "")
    return fail("اكتب رقم صحيح");
  const supabase = await createClient();
  const { error } = await supabase
    .from("raw_materials")
    .update({ min_qty: parsed.data })
    .eq("id", materialId);
  if (error) return fail("ما انحفظ");
  refresh();
  return { status: "done" };
}

export async function addUnitAction(
  materialId: string,
  unitName: string,
  factor: number,
): Promise<RawResult> {
  await requireAdmin();
  const name = z.string().trim().min(1).max(20).safeParse(unitName);
  const f = z.number().positive().max(100_000).safeParse(factor);
  if (!idSchema.safeParse(materialId).success || !name.success || !f.success)
    return fail("اكتب اسم الوحدة وكم بتساوي");
  const supabase = await createClient();
  const { error } = await supabase
    .from("raw_material_units")
    .insert({ material_id: materialId, unit_name: name.data, factor_to_base: f.data });
  if (error) return fail(error.code === "23505" ? "الوحدة موجودة" : "ما انحفظت الوحدة");
  refresh();
  return { status: "done" };
}

export async function setMaterialActiveAction(materialId: string, active: boolean): Promise<RawResult> {
  await requireAdmin();
  if (!idSchema.safeParse(materialId).success || typeof active !== "boolean") return fail("المادة مش موجودة");
  const supabase = await createClient();
  const { error } = await supabase.from("raw_materials").update({ is_active: active }).eq("id", materialId);
  if (error) return fail("ما انحفظ");
  refresh();
  return { status: "done" };
}
