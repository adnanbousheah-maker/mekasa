import "server-only";
import { requireManager } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ACTION_LABELS, TABLE_LABELS, changesOf, itemName, type Change } from "./format";

export interface AuditFilter {
  table?: string;
  staffId?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface AuditRow {
  id: number;
  at: string;
  who: string;
  what: string;
  action: string;
  item: string | null;
  reason: string | null;
  changes: Change[];
}

export const AUDIT_PAGE = 50;

/** سجل التعديلات بفلاتر، الأحدث أول. الأدمن والمدير العام بس (RLS). */
export async function listAudit(filter: AuditFilter): Promise<{ rows: AuditRow[]; more: boolean }> {
  await requireManager();
  const supabase = await createClient();
  const page = Math.max(0, filter.page ?? 0);
  let q = supabase
    .from("audit_log")
    .select("id, table_name, row_id, action, old_values, new_values, reason, changed_by, changed_at")
    .order("id", { ascending: false })
    .range(page * AUDIT_PAGE, page * AUDIT_PAGE + AUDIT_PAGE);
  if (filter.table) q = q.eq("table_name", filter.table);
  if (filter.staffId) q = q.eq("changed_by", filter.staffId);
  if (filter.from) q = q.gte("changed_at", `${filter.from}T00:00:00+03:00`);
  if (filter.to) q = q.lt("changed_at", `${filter.to}T24:00:00+03:00`);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load the audit log: ${error.message}`);

  const staffIds = [...new Set(data.map((a) => a.changed_by).filter((id): id is string => !!id))];
  const { data: names } = staffIds.length
    ? await supabase.from("staff").select("id, full_name").in("id", staffIds)
    : { data: [] };
  const nameOf = new Map((names ?? []).map((s) => [s.id, s.full_name]));

  const rows = data.slice(0, AUDIT_PAGE).map((a) => {
    const oldV = a.old_values as Record<string, unknown> | null;
    const newV = a.new_values as Record<string, unknown> | null;
    return {
      id: a.id,
      at: a.changed_at,
      who: a.changed_by ? (nameOf.get(a.changed_by) ?? "موظف") : "النظام",
      what: TABLE_LABELS[a.table_name] ?? a.table_name,
      action: ACTION_LABELS[a.action] ?? a.action,
      item: itemName(newV) ?? itemName(oldV),
      reason: a.reason,
      changes: changesOf(a.action, oldV, newV),
    };
  });
  return { rows, more: data.length > AUDIT_PAGE };
}

/** الموظفين اللي إلهم تعديلات (للفلتر). */
export async function auditAuthors(): Promise<{ id: string; name: string }[]> {
  await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("id, full_name").order("full_name");
  return (data ?? []).map((s) => ({ id: s.id, name: s.full_name }));
}
