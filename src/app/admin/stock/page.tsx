import { connection } from "next/server";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { ProductName } from "@/components/ui/ProductName";
import {
  ExportButton,
  FilterLinks,
  PageHeader,
  tableClass,
  tdClass,
  theadRowClass,
  thClass,
} from "@/features/admin/components/AdminBits";
import { addDays } from "@/features/reports/format";
import {
  consumptionSince,
  listReportLocations,
  listReportProducts,
  parLevels,
  stockByProduct,
} from "@/features/reports/queries";
import { formatQuantityCompact } from "@/lib/units";
import { businessDate } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/admin/AdminStock.dc.html
export default function StockPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Stock searchParams={searchParams} />
    </Suspense>
  );
}

async function Stock({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // التاريخ لكل طلب (cacheComponents)
  await connection();
  const view = params.view === "use" ? "use" : "stock";
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const today = businessDate(new Date());

  const [locations, products, stock, par, use] = await Promise.all([
    listReportLocations(),
    listReportProducts(),
    stockByProduct(),
    parLevels(),
    consumptionSince(addDays(today, -6)),
  ]);
  const columns = view === "use" ? locations.filter((l) => l.kind === "branch") : locations;
  const source = view === "use" ? use : stock;
  const rows = products.filter(
    (p) => (p.isActive || source.has(p.id)) && (!q || p.nameEn.toLowerCase().includes(q)),
  );
  const href = (v: string) => `/admin/stock?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        title="الستوك والاستهلاك"
        subtitle="حسب آخر جرد بكل موقع، مع الحركات اللي صارت بعده"
        actions={<ExportButton href={`/admin/export/stock?view=${view}`} />}
      />
      <div className="flex flex-wrap items-center gap-3">
        <FilterLinks
          label="طريقة العرض"
          current={view}
          hrefFor={href}
          options={[
            { value: "stock", label: "الكمية الحالية" },
            { value: "use", label: "استهلاك آخر 7 أيام" },
          ]}
        />
        <form className="flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3">
          <input type="hidden" name="view" value={view} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="دوّر على صنف"
            aria-label="بحث"
            className="w-44 bg-transparent text-sm outline-none"
          />
        </form>
        <span className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
          <span>ك = كيكة · ق = قطعة</span>
          {view === "stock" && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-warn" aria-hidden="true" />
              تحت الحد المطلوب
            </span>
          )}
        </span>
      </div>

      <div className="scroll-hint overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className={`${tableClass} min-w-[720px]`}>
          <thead>
            <tr className={theadRowClass}>
              <th scope="col" className={thClass}>
                الصنف
              </th>
              {columns.map((l) => (
                <th key={l.id} scope="col" className={`${thClass} text-center`}>
                  {l.name}
                </th>
              ))}
              <th scope="col" className={`${thClass} text-center`}>
                {view === "use" ? "مجموع الأسبوع" : "المجموع"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-muted">
                  ما في أصناف.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const byLocation = source.get(p.id);
              const total = columns.reduce((s, l) => s + (byLocation?.get(l.id) ?? 0), 0);
              return (
                <tr key={p.id} className="border-t border-line-soft">
                  <th scope="row" className={`${tdClass} text-right font-semibold`}>
                    <ProductName name={p.nameEn} />
                  </th>
                  {columns.map((l) => {
                    const qty = byLocation?.get(l.id) ?? 0;
                    const target = par.get(p.id)?.get(l.id);
                    const low =
                      view === "stock" && l.kind === "branch" && target !== undefined && qty < target;
                    return (
                      <td
                        key={l.id}
                        className={`${tdClass} text-center tabular-nums ${qty < 0 ? "text-danger" : ""}`}
                        aria-label={low ? "تحت الحد المطلوب" : undefined}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {low && <span className="size-2 rounded-full bg-warn" aria-hidden="true" />}
                          {qty === 0 ? (
                            <span className="text-line-strong">—</span>
                          ) : (
                            formatQuantityCompact(qty, p.piecesPerCake)
                          )}
                        </span>
                      </td>
                    );
                  })}
                  <td className={`${tdClass} text-center font-semibold tabular-nums`}>
                    {formatQuantityCompact(total, p.piecesPerCake)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        الاستهلاك = الجرد السابق + المستلم − اللي طلع − التالف − الجرد الحالي. هو مش مبيعات: فيه كمان أي تالف
        ما انسجل. بعد الربط مع نقطة البيع بيطلع الفرق غير المفسّر.
      </p>
    </>
  );
}
