import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { DayBadge } from "@/components/ui/DayBadge";
import { ProductName } from "@/components/ui/ProductName";
import { ExportButton, PageHeader, tableClass, theadRowClass } from "@/features/admin/components/AdminBits";
import { factoryMatrix, productionVsCount } from "@/features/reports/queries";
import { DAY_NAMES, dayNumberOf } from "@/lib/day-number";
import { businessDate } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

// design/admin/AdminFactory.dc.html
export default function AdminFactoryPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Factory />
    </Suspense>
  );
}

async function Factory() {
  const matrix = await factoryMatrix();
  const checks = matrix.factoryId ? await productionVsCount(matrix.factoryId) : [];
  const today = businessDate(new Date());
  const lastDay = matrix.dates[matrix.dates.length - matrix.shelfLifeDays];
  const q = (n: number, ppc: number | null) => (n === 0 ? "0" : formatQuantityCompact(n, ppc));

  return (
    <>
      <PageHeader
        title="ستوك المصنع والدفعات"
        subtitle="كل عمود رقم يوم إنتاج. الأقدم على اليمين، ولازم يطلع أول."
        actions={<ExportButton href="/admin/export/factory" />}
      />
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className={`${tableClass} min-w-[760px]`}>
          <thead>
            <tr className={theadRowClass}>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                الصنف
              </th>
              {matrix.dates.map((d) => {
                const day = dayNumberOf(d);
                return (
                  <th key={d} scope="col" className="px-2 py-3 font-semibold">
                    <span className="flex flex-col items-center gap-1">
                      <DayBadge day={day} size="sm" />
                      <span className="text-xs font-normal">
                        {d === today ? "اليوم" : DAY_NAMES[day]}
                        {d === lastDay ? " · آخر يوم" : d < lastDay ? " · منتهية" : ""}
                      </span>
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="px-3 py-3 font-semibold">
                المجموع
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.length === 0 && (
              <tr>
                <td colSpan={matrix.dates.length + 2} className="px-4 py-8 text-center text-muted">
                  ما في ستوك بالمصنع. سجّل الإنتاج أو اعمل جرد.
                </td>
              </tr>
            )}
            {matrix.rows.map((r) => {
              const total = [...r.byDate.values()].reduce((s, n) => s + n, 0);
              return (
                <tr key={r.productId} className="border-t border-line-soft">
                  <th scope="row" className="px-3 py-2.5 text-right font-semibold">
                    <ProductName name={r.nameEn} />
                  </th>
                  {matrix.dates.map((d) => {
                    const n = r.byDate.get(d) ?? 0;
                    const urgent = n > 0 && d <= lastDay;
                    return (
                      <td
                        key={d}
                        className={`px-2 py-2.5 text-center tabular-nums ${n === 0 ? "text-line-strong" : "font-bold"} ${urgent ? "bg-danger-soft text-danger-text" : ""}`}
                      >
                        {n === 0 ? "·" : q(n, r.piecesPerCake)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center font-semibold tabular-nums">
                    {q(total, r.piecesPerCake)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[17px] font-bold">إنتاج اليوم مقابل الجرد</h2>
        <span className="text-[13px] leading-relaxed text-muted">
          اللي انسجل إنتاج رقم {dayNumberOf(today)}، ناقص اللي طلع منه، لازم يساوي جرد رقم{" "}
          {dayNumberOf(today)}. أي فرق معناه إنتاج انسجل غلط أو بضاعة طلعت بدون إخراج.
        </span>
        <div className="overflow-x-auto">
          <table className={`${tableClass} min-w-[560px]`}>
            <thead>
              <tr className={theadRowClass}>
                {["الصنف", "انسجل إنتاج", "طلع منه", "تالف", "المتوقع", "الجرد", "الفرق"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-3 py-2.5 font-semibold ${i === 0 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    ما انسجل إنتاج اليوم.
                  </td>
                </tr>
              )}
              {checks.map((c) => {
                const diff = c.counted === null ? null : c.counted - c.expected;
                return (
                  <tr key={c.productId} className="border-t border-line-soft">
                    <th scope="row" className="px-3 py-2.5 text-right font-semibold">
                      <ProductName name={c.nameEn} />
                    </th>
                    <td className="px-3 py-2.5 text-center tabular-nums">{q(c.produced, c.piecesPerCake)}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{q(c.out, c.piecesPerCake)}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{q(c.waste, c.piecesPerCake)}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{q(c.expected, c.piecesPerCake)}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {c.counted === null ? "لسا" : q(c.counted, c.piecesPerCake)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-center font-semibold tabular-nums ${diff === null ? "text-muted" : diff === 0 ? "text-ok-text" : "text-danger-text"}`}
                    >
                      {diff === null
                        ? "—"
                        : diff === 0
                          ? "تمام"
                          : `${diff > 0 ? "+" : "−"}${q(Math.abs(diff), c.piecesPerCake)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
