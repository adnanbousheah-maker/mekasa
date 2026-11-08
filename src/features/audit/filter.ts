import { TABLE_LABELS } from "./format";
import type { AuditFilter } from "./queries";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const one = (params: Params, key: string) => {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  return typeof v === "string" ? v : "";
};

/** الفلاتر من الرابط بعد التحقق (نفسها للصفحة وللتصدير). */
export function auditFilterFrom(params: Params): AuditFilter {
  const table = one(params, "type");
  const who = one(params, "who");
  const from = one(params, "from");
  const to = one(params, "to");
  const page = Number(one(params, "page"));
  return {
    table: table in TABLE_LABELS ? table : undefined,
    staffId: UUID.test(who) ? who : undefined,
    from: DATE.test(from) ? from : undefined,
    to: DATE.test(to) ? to : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 0,
  };
}
