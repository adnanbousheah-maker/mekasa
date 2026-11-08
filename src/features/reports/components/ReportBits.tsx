import type { ReactNode } from "react";
import { change } from "../period";

/** رقم بمنزلة وحدة بالكثير. */
export function num(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/**
 * التغيير عن الفترة اللي قبلها. "أحسن" بيتحدد حسب المؤشر (التالف لما ينزل أحسن، الالتزام لما يطلع).
 * السهم والكلمة مع اللون، مش اللون لحاله.
 */
export function Delta({
  now,
  before,
  better,
}: {
  now: number;
  before: number;
  better: "up" | "down" | "none";
}) {
  const pct = change(now, before);
  if (pct === null) return <span className="text-xs text-muted">ما في أرقام قبل للمقارنة</span>;
  if (pct === 0) return <span className="text-xs text-muted">نفس الفترة اللي قبل</span>;
  const up = pct > 0;
  const good = better === "none" ? null : (better === "up") === up;
  const tone = good === null ? "text-muted" : good ? "text-ok-text" : "text-danger-text";
  return (
    <span className={`text-xs font-semibold ${tone}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% {up ? "أكثر" : "أقل"} من الفترة اللي قبل
    </span>
  );
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex min-w-[170px] flex-1 flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[26px] leading-tight font-bold tabular-nums">
        {value}
        {unit && <span className="ms-1 text-sm font-normal text-muted">{unit}</span>}
      </span>
      {delta}
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

/**
 * أعمدة يومية صغيرة لكل فرع، بنفس المقياس لكل الفروع (مشان تنقارن).
 * لون واحد، والرقم بيبين بالمرور (title) وبالجدول تحت.
 */
export function DailyColumns({
  days,
  rows,
  max,
}: {
  days: string[];
  rows: { label: string; values: number[] }[];
  max: number;
}) {
  const top = Math.max(max, 1);
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => (
        <figure key={r.label} className="flex flex-col gap-1.5">
          <figcaption className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{r.label}</span>
            <span className="text-xs text-muted tabular-nums">
              المجموع {num(r.values.reduce((s, v) => s + v, 0))} كيكة
            </span>
          </figcaption>
          <div
            className="flex h-20 items-end gap-0.5 border-b border-line"
            dir="ltr"
            role="img"
            aria-label={`الاستهلاك اليومي ${r.label}`}
          >
            {r.values.map((v, i) => (
              <div
                key={days[i]}
                title={`${days[i]}: ${num(v)} كيكة`}
                className="group flex h-full min-w-1 flex-1 items-end"
              >
                <div
                  className="w-full rounded-t-[4px] bg-ink group-hover:bg-brand"
                  style={{ height: v > 0 ? `${Math.max(3, (v / top) * 100)}%` : "0%" }}
                />
              </div>
            ))}
          </div>
        </figure>
      ))}
      <div className="flex justify-between text-[11px] text-muted" dir="ltr">
        <span>{days[0]?.slice(5)}</span>
        <span>{days[days.length - 1]?.slice(5)}</span>
      </div>
    </div>
  );
}
