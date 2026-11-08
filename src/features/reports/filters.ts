// فلاتر صفحات الإدارة: من الرابط (?key=value) لكائن نظيف، ونفس الفلتر للصفحة وللتصدير.
// كلها بدون استيراد سيرفر، مشان تنفحص بسهولة.

import { parseRange, type Range } from "./format";

export type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function param(params: Params, key: string): string {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  return typeof v === "string" ? v.trim() : "";
}

const uuid = (v: string) => (UUID.test(v) ? v : "");
const date = (v: string) => (DATE.test(v) ? v : "");
const text = (v: string) => v.slice(0, 60);

/** بحث بالعربي والإنجليزي، بدون حساسية للحروف ولا الهمزات والتاء المربوطة. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matches(q: string, ...fields: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const needle = normalize(q);
  return fields.some((f) => f && normalize(f).includes(needle));
}

/** الفلاتر الفعّالة كرابط (للتصدير وللفلاتر المحفوظة). */
export function toQuery(filter: Record<string, string | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === true) q.set(k, "1");
    else if (typeof v === "string" && v) q.set(k, v);
  }
  return q.toString();
}

// ─── التالف ──────────────────────────────────────────────────────────

export interface WasteFilter {
  range: Range;
  location: string;
  reason: string;
  q: string;
  who: string;
}

export function wasteFilter(params: Params): WasteFilter {
  return {
    range: parseRange(param(params, "range") || undefined),
    location: uuid(param(params, "location")),
    reason: text(param(params, "reason")),
    q: text(param(params, "q")),
    who: text(param(params, "who")),
  };
}

export function applyWasteFilter<
  T extends {
    locationId: string;
    reasonName: string;
    productName: string;
    recordedBy: string;
    note: string | null;
  },
>(rows: T[], f: WasteFilter): T[] {
  return rows.filter(
    (r) =>
      (!f.location || r.locationId === f.location) &&
      (!f.reason || r.reasonName === f.reason) &&
      (!f.who || r.recordedBy === f.who) &&
      matches(f.q, r.productName, r.note),
  );
}

// ─── الجرودات ────────────────────────────────────────────────────────

export interface CountsFilter {
  location: string;
  from: string;
  to: string;
  method: "" | "manual" | "photo";
  issues: boolean;
  who: string;
}

export function countsFilter(params: Params): CountsFilter {
  const method = param(params, "method");
  return {
    location: uuid(param(params, "location")),
    from: date(param(params, "from")),
    to: date(param(params, "to")),
    method: method === "manual" || method === "photo" ? method : "",
    issues: param(params, "issues") === "1",
    who: text(param(params, "who")),
  };
}

export function applyCountsFilter<
  T extends { impossibleLines: number; staffCorrectedLines: number; countedBy: string },
>(rows: T[], f: CountsFilter): T[] {
  return rows.filter(
    (r) =>
      (!f.issues || r.impossibleLines > 0 || r.staffCorrectedLines > 0) && (!f.who || r.countedBy === f.who),
  );
}

// ─── الموظفين ────────────────────────────────────────────────────────

export interface StaffFilter {
  q: string;
  location: string;
  role: string;
  status: "" | "active" | "inactive" | "locked";
}

export function staffFilter(params: Params): StaffFilter {
  const status = param(params, "status");
  return {
    q: text(param(params, "q")),
    location: uuid(param(params, "location")),
    role: /^[a-z_]{3,30}$/.test(param(params, "role")) ? param(params, "role") : "",
    status: status === "active" || status === "inactive" || status === "locked" ? status : "",
  };
}

export function applyStaffFilter<
  T extends {
    fullName: string;
    phone: string;
    username: string | null;
    isActive: boolean;
    isLocked: boolean;
    location: { id: string } | null;
    roles: string[];
  },
>(rows: T[], f: StaffFilter): T[] {
  const digits = f.q.replace(/\D/g, "");
  return rows.filter(
    (s) =>
      (matches(f.q, s.fullName, s.username) ||
        (digits.length >= 3 && s.phone.includes(digits.replace(/^0/, "")))) &&
      (!f.location || s.location?.id === f.location) &&
      (!f.role || s.roles.includes(f.role)) &&
      (!f.status ||
        (f.status === "active" && s.isActive) ||
        (f.status === "inactive" && !s.isActive) ||
        (f.status === "locked" && s.isLocked)),
  );
}

// ─── المواد الأولية ──────────────────────────────────────────────────

export interface RawFilter {
  q: string;
  category: string;
  low: boolean;
}

export function rawFilter(params: Params): RawFilter {
  return {
    q: text(param(params, "q")),
    category: uuid(param(params, "category")),
    low: param(params, "low") === "1",
  };
}

export function applyRawFilter<
  T extends {
    name: string;
    code: string | null;
    categoryId: string | null;
    belowMin: boolean;
    isActive: boolean;
  },
>(rows: T[], f: RawFilter, parentOf: (id: string) => string | null = () => null): T[] {
  return rows.filter(
    (m) =>
      matches(f.q, m.name, m.code) &&
      // التصنيف الرئيسي بيشمل فروعه
      (!f.category ||
        m.categoryId === f.category ||
        (m.categoryId !== null && parentOf(m.categoryId) === f.category)) &&
      (!f.low || (m.belowMin && m.isActive)),
  );
}

// ─── الستوك ──────────────────────────────────────────────────────────

/** الصنف تحت الحد المطلوب بفرع واحد على الأقل (اللي إله حد). */
export function belowPar(
  productId: string,
  stock: Map<string, Map<string, number>>,
  par: Map<string, Map<string, number>>,
  locations: { id: string; kind: string }[],
): boolean {
  return locations
    .filter((l) => l.kind === "branch")
    .some((l) => {
      const target = par.get(productId)?.get(l.id);
      return target !== undefined && (stock.get(productId)?.get(l.id) ?? 0) < target;
    });
}
