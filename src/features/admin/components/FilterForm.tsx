import Link from "next/link";
import { SavedFilters } from "./SavedFilters";

type Field =
  | {
      kind: "select";
      name: string;
      label: string;
      value: string;
      options: { value: string; label: string }[];
    }
  | { kind: "date"; name: string; label: string; value: string }
  | { kind: "text"; name: string; label: string; value: string; placeholder?: string }
  | { kind: "check"; name: string; label: string; value: boolean };

const control = "h-10 rounded-[10px] border border-line-strong bg-surface px-2.5 text-sm";

/**
 * شريط فلاتر موحّد: الفلاتر بالرابط (?key=value)، فبتنحفظ بالمفضلة وبتنبعت لحدا،
 * والتصدير بياخذ نفس الرابط. بدون جافاسكربت: form GET عادي. فيه "احفظ هالفلتر" (بالمتصفح).
 */
export function FilterForm({
  action,
  fields,
  hidden = {},
  resetHref,
  count,
}: {
  action: string;
  fields: Field[];
  // قيم بتضل مع الفلاتر (مثلاً الفترة من أزرار فوق)
  hidden?: Record<string, string>;
  // وين بيرجع "مسح الفلاتر" (افتراضي: الصفحة بدون أي شي)
  resetHref?: string;
  // "عم يبين X من Y"
  count?: { shown: number; total: number };
}) {
  const active = fields.some((f) => (f.kind === "check" ? f.value : f.value));
  return (
    <div className="flex flex-col gap-1.5">
      <form
        method="get"
        action={action}
        role="search"
        aria-label="فلاتر"
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3"
      >
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {fields.map((f) =>
          f.kind === "check" ? (
            <label key={f.name} className="flex h-10 items-center gap-2 px-1 text-sm">
              <input
                type="checkbox"
                name={f.name}
                value="1"
                defaultChecked={f.value}
                className="size-4 accent-ink"
              />
              {f.label}
            </label>
          ) : (
            <label key={f.name} className="flex flex-col gap-1 text-xs text-muted">
              {f.label}
              {f.kind === "select" ? (
                <select name={f.name} defaultValue={f.value} className={`${control} min-w-36`}>
                  <option value="">الكل</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.kind === "date" ? "date" : "search"}
                  name={f.name}
                  defaultValue={f.value}
                  dir={f.kind === "date" ? "ltr" : undefined}
                  placeholder={f.kind === "text" ? f.placeholder : undefined}
                  className={`${control} ${f.kind === "text" ? "w-48" : ""}`}
                />
              )}
            </label>
          ),
        )}
        <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
          طبّق
        </button>
        {active && (
          <Link
            href={resetHref ?? action}
            className="flex h-10 items-center px-2 text-sm text-muted underline"
          >
            مسح الفلاتر
          </Link>
        )}
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {count ? (
          <span className="text-xs text-muted" role="status">
            {count.shown === count.total
              ? `${count.total} نتيجة`
              : `عم يبين ${count.shown} من ${count.total}`}
          </span>
        ) : (
          <span />
        )}
        <SavedFilters page={action} />
      </div>
    </div>
  );
}
