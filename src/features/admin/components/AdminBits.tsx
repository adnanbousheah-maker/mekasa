import Link from "next/link";
import type { ReactNode } from "react";

/** عنوان صفحة الأدمن مع سطر تحته وأزرار على الطرف. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">{title}</h1>
        {subtitle && <span className="text-sm text-muted">{subtitle}</span>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** زر "تصدير Excel" (كل جدول بلوحة الأدمن إله واحد). */
export function ExportButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3.5 text-sm font-semibold"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-ok"
      >
        <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
      </svg>
      تصدير Excel
    </a>
  );
}

/** بطاقة رقم: عنوان صغير، رقم كبير، وسطر شرح. */
export function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "danger" | "warn";
}) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="flex min-w-[180px] flex-1 flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {note && <span className="text-[13px] text-muted">{note}</span>}
    </div>
  );
}

/** أعمدة أفقية بسيطة (الاستهلاك والتالف حسب الموقع). */
export function Bars({
  items,
  unit,
  empty,
}: {
  items: { label: string; value: number }[];
  unit?: string;
  // نص بدل الأعمدة إذا كلها صفر (مشان ما تبين معطلة)
  empty?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (empty && items.every((i) => i.value === 0)) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[80px_1fr_56px] items-center gap-2.5 text-sm">
          <span>{i.label}</span>
          <div className="h-[22px] rounded-md bg-quiet">
            <div
              className="h-full rounded-md bg-ink"
              style={{ width: `${Math.max(0, (i.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-left font-semibold tabular-nums">
            {i.value}
            {unit ? ` ${unit}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** أزرار فلتر بالرابط (?key=value). */
export function FilterLinks({
  options,
  current,
  hrefFor,
  label,
}: {
  options: { value: string; label: string }[];
  current: string;
  hrefFor: (value: string) => string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Link
          key={o.value}
          href={hrefFor(o.value)}
          aria-current={o.value === current ? "page" : undefined}
          className={`flex h-10 items-center rounded-[10px] px-3.5 text-sm ${o.value === current ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export const tableClass = "w-full border-collapse text-sm";
export const theadRowClass = "bg-table-head text-table-head-text";
export const thClass = "px-3 py-3 text-right font-semibold whitespace-nowrap";
export const tdClass = "px-3 py-2.5";
