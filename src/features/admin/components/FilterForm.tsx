import Link from "next/link";

type Field =
  | {
      kind: "select";
      name: string;
      label: string;
      value: string;
      options: { value: string; label: string }[];
    }
  | { kind: "date"; name: string; label: string; value: string }
  | { kind: "text"; name: string; label: string; value: string; placeholder?: string };

const control = "h-10 rounded-[10px] border border-line-strong bg-surface px-2.5 text-sm";

/**
 * شريط فلاتر موحّد: الفلاتر بالرابط (?key=value)، فبتنحفظ بالمفضلة وبتنبعت لحدا،
 * والتصدير بياخذ نفس الرابط. بدون جافاسكربت: form GET عادي.
 */
export function FilterForm({ action, fields }: { action: string; fields: Field[] }) {
  const active = fields.some((f) => f.value);
  return (
    <form
      method="get"
      action={action}
      role="search"
      aria-label="فلاتر"
      className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3"
    >
      {fields.map((f) => (
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
              type={f.kind}
              name={f.name}
              defaultValue={f.value}
              dir={f.kind === "date" ? "ltr" : undefined}
              placeholder={f.kind === "text" ? f.placeholder : undefined}
              className={control}
            />
          )}
        </label>
      ))}
      <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
        طبّق
      </button>
      {active && (
        <Link href={action} className="flex h-10 items-center px-2 text-sm text-muted underline">
          مسح الفلاتر
        </Link>
      )}
    </form>
  );
}
