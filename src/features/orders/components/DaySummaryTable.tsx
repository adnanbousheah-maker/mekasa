import Link from "next/link";
import { ProductName } from "@/components/ui/ProductName";
import { PrintButton } from "@/components/ui/PrintButton";
import { formatLongDate } from "@/lib/time";
import { formatQuantity } from "@/lib/units";
import { shiftDate, type DaySummary } from "../day-summary";

type Props = { summary: DaySummary; date: string; today: string; basePath: string; exportHref?: string };

/** طلبيات يوم من المصنع مجمّعة حسب الصنف، للإنتاج. بتنطبع على ورقة وحدة. */
export function DaySummaryTable({ summary, date, today, basePath, exportHref }: Props) {
  const { branches, rows } = summary;
  return (
    <section aria-label="طلبيات اليوم" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link
            href={`${basePath}?date=${shiftDate(date, -1)}`}
            className="flex h-11 items-center rounded-xl border border-line-strong bg-surface px-3"
          >
            ← اليوم اللي قبل
          </Link>
          {date !== today && (
            <Link
              href={`${basePath}?date=${shiftDate(date, 1)}`}
              className="flex h-11 items-center rounded-xl border border-line-strong bg-surface px-3"
            >
              اللي بعده →
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {exportHref && (
            <a
              href={exportHref}
              download
              className="flex h-12 items-center rounded-xl border border-line-strong bg-surface px-4 font-semibold"
            >
              Excel
            </a>
          )}
          <PrintButton label="اطبع للإنتاج" />
        </div>
      </div>

      <h2 className="text-lg font-bold">
        طلبيات {formatLongDate(date)}
        {date === today ? " (اليوم)" : ""} · {summary.requests} {summary.requests === 1 ? "طلب" : "طلبات"}
      </h2>
      <p className="text-sm text-muted print:hidden">
        اللي طلبته الفروع من المصنع بهاليوم (بدون الملغي)، وبيطلع غالباً تاني يوم. الكميات زي ما طلبوها، قبل
        أي تعديل بالإخراج.
      </p>

      {rows.length === 0 ? (
        <p className="text-muted">ما في طلبات بهاليوم.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface print:overflow-visible print:border-ink">
          <table className="w-full min-w-[420px] border-collapse text-sm print:text-[13px]">
            <thead>
              <tr className="bg-table-head text-table-head-text">
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  الصنف
                </th>
                {branches.map((b) => (
                  <th key={b.id} scope="col" className="px-3 py-2.5 font-semibold">
                    {b.name}
                  </th>
                ))}
                <th scope="col" className="bg-quiet-strong px-3 py-2.5 font-bold text-ink">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product.id} className="border-t border-line-soft">
                  <th scope="row" className="px-3 py-2 text-right font-semibold">
                    <ProductName name={r.product.nameEn} />
                  </th>
                  {branches.map((b) => {
                    const q = r.byBranch.get(b.id);
                    return (
                      <td key={b.id} className="px-3 py-2 text-center tabular-nums">
                        {q ? formatQuantity(q, r.product.piecesPerCake) : "—"}
                      </td>
                    );
                  })}
                  <td className="bg-quiet px-3 py-2 text-center font-bold tabular-nums">
                    {formatQuantity(r.total, r.product.piecesPerCake)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
