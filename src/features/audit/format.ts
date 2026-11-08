// سجل التعديلات بكلام مفهوم: شو تغيّر، من شو لشو.

export const TABLE_LABELS: Record<string, string> = {
  products: "صنف",
  locations: "موقع",
  staff: "موظف",
  staff_roles: "دور موظف",
  app_settings: "الإعدادات العامة",
  count_schedules: "موعد جرد",
  count_form_versions: "فورم الجرد",
  par_levels: "الحد المطلوب والأدنى",
  raw_materials: "مادة أولية",
  raw_material_units: "تعبئة مادة",
  stock_count_lines: "تصحيح جرد",
  raw_count_lines: "تصحيح جرد مواد",
  receipt_lines: "قرار فرق استلام",
  stock_requests: "طلب",
  dispatches: "إخراج",
  monthly_counts: "جرد آخر الشهر",
};

export const ACTION_LABELS: Record<string, string> = { insert: "إضافة", update: "تعديل", delete: "حذف" };

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  name_en: "الاسم",
  name_ar: "الاسم الثاني",
  full_name: "الاسم",
  phone: "الجوال",
  username: "اسم المستخدم",
  is_active: "فعّال",
  location_id: "الموقع",
  role: "الدور",
  pieces_per_cake: "قطع بالكيكة",
  shelf_life_days: "مدة الحياة",
  sell_mode: "طريقة البيع",
  par_pieces: "الحد المطلوب",
  min_pieces: "الحد الأدنى",
  min_qty: "الحد الأدنى",
  time_of_day: "الساعة",
  whole_cakes: "كيكات",
  loose_pieces: "قطع",
  status: "الحالة",
  resolution: "القرار",
  qty_base: "الكمية",
  factor: "الحجم",
  code: "الكود",
  sort_order: "الترتيب",
  failed_pin_attempts: "محاولات غلط",
  locked_until: "مقفول لحد",
};

// حقول تقنية ما بتعني للأدمن إشي
const HIDDEN = new Set(["updated_at", "created_at", "id", "created_by", "updated_by", "last_login_at"]);

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replaceAll("_", " ");
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === true) return "نعم";
  if (value === false) return "لا";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface Change {
  field: string;
  from: string;
  to: string;
}

/** الحقول اللي تغيّرت (بالإضافة: كل القيم، بالحذف: القيم القديمة). */
export function changesOf(
  action: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): Change[] {
  const keys = new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})]);
  const out: Change[] = [];
  for (const key of keys) {
    if (HIDDEN.has(key)) continue;
    const before = oldValues?.[key];
    const after = newValues?.[key];
    if (action === "update" && JSON.stringify(before) === JSON.stringify(after)) continue;
    if (action === "insert" && (after === null || after === undefined)) continue;
    out.push({ field: fieldLabel(key), from: show(before), to: show(after) });
  }
  return out;
}

/** اسم العنصر من قيمه (لو فيها اسم). */
export function itemName(values: Record<string, unknown> | null): string | null {
  for (const key of ["name_en", "full_name", "name", "code"]) {
    const v = values?.[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}
