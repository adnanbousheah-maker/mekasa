import "server-only";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface RawMaterialRow {
  id: string;
  code: string | null;
  name: string;
  baseUnit: string;
  minQty: number;
  isActive: boolean;
  qty: number;
  dailyIssue: number;
  daysLeft: number | null;
  belowMin: boolean;
  units: { id: string; name: string; factor: number }[];
  lastReceipt: { at: string; enteredQty: number | null; unitName: string | null; qtyBase: number } | null;
}

/** المواد مع الموجود والصرف اليومي (آخر 14 يوم) وبيكفي كم يوم. RLS: موظفين المصنع والأدمن. */
export async function listRawMaterials(includeInactive = false): Promise<RawMaterialRow[]> {
  await requireStaff();
  const supabase = await createClient();
  let materials = supabase
    .from("raw_materials")
    .select(
      "id, code, name, base_unit, min_qty, is_active, raw_material_units(id, unit_name, factor_to_base)",
    )
    .order("sort_order")
    .order("name");
  if (!includeInactive) materials = materials.eq("is_active", true);
  const [{ data, error }, { data: stock }, { data: receipts }] = await Promise.all([
    materials,
    supabase.from("v_raw_stock").select("material_id, qty_base, avg_daily_issue, days_left, below_min"),
    supabase
      .from("raw_movements")
      .select("material_id, occurred_at, entered_qty, qty_base, unit:raw_material_units(unit_name)")
      .eq("movement_type", "receipt")
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);
  if (error) throw new Error(`Could not load raw materials: ${error.message}`);
  const stockOf = new Map((stock ?? []).map((s) => [s.material_id!, s]));
  return data.map((m) => {
    const s = stockOf.get(m.id);
    const last = (receipts ?? []).find((r) => r.material_id === m.id);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      baseUnit: m.base_unit,
      minQty: Number(m.min_qty),
      isActive: m.is_active,
      qty: Number(s?.qty_base ?? 0),
      dailyIssue: Number(s?.avg_daily_issue ?? 0),
      daysLeft: s?.days_left ?? null,
      belowMin: s?.below_min ?? Number(m.min_qty) > 0,
      units: m.raw_material_units.map((u) => ({
        id: u.id,
        name: u.unit_name,
        factor: Number(u.factor_to_base),
      })),
      lastReceipt: last
        ? {
            at: last.occurred_at,
            enteredQty: last.entered_qty === null ? null : Number(last.entered_qty),
            unitName: last.unit?.unit_name ?? null,
            qtyBase: Number(last.qty_base),
          }
        : null,
    };
  });
}

export interface RawMove {
  id: number;
  at: string;
  kind: "opening_balance" | "receipt" | "issue" | "count_adjustment" | "admin_correction";
  materialName: string;
  baseUnit: string;
  qtyBase: number;
  enteredQty: number | null;
  unitName: string | null;
  supplierName: string | null;
  hasInvoice: boolean;
  invoicePath: string | null;
  by: string;
}

export async function recentRawMoves(limit = 30): Promise<RawMove[]> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("raw_movements")
    .select(
      "id, occurred_at, movement_type, qty_base, entered_qty, supplier_name, invoice_photo_path, created_by, material:raw_materials(name, base_unit), unit:raw_material_units(unit_name)",
    )
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load raw movements: ${error.message}`);
  const ids = [...new Set(data.map((m) => m.created_by).filter((id): id is string => !!id))];
  const { data: names } = ids.length
    ? await supabase.from("v_staff_names").select("id, full_name").in("id", ids)
    : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id!, n.full_name!]));
  return data.map((m) => ({
    id: m.id,
    at: m.occurred_at,
    kind: m.movement_type,
    materialName: m.material.name,
    baseUnit: m.material.base_unit,
    qtyBase: Number(m.qty_base),
    enteredQty: m.entered_qty === null ? null : Number(m.entered_qty),
    unitName: m.unit?.unit_name ?? null,
    supplierName: m.supplier_name,
    hasInvoice: !!m.invoice_photo_path,
    invoicePath: m.invoice_photo_path,
    by: (m.created_by && nameOf.get(m.created_by)) || "",
  }));
}
