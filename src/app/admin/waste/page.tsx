import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { DayBadge } from "@/components/ui/DayBadge";
import { ProductName } from "@/components/ui/ProductName";
import {
  Bars,
  ExportButton,
  FilterLinks,
  Kpi,
  PageHeader,
  tableClass,
  tdClass,
  theadRowClass,
  thClass,
} from "@/features/admin/components/AdminBits";
import { signedPhotoUrl } from "@/features/photos/queries";
import {
  RANGE_LABELS,
  parseRange,
  percent,
  toCakes,
  totalCakesAndPieces,
  type Range,
} from "@/features/reports/format";
import { listReportLocations, listWaste } from "@/features/reports/queries";
import { WASTE_REASON_LABELS, WASTE_REASONS } from "@/features/waste/schemas";
import type { DayNumber } from "@/lib/day-number";
import { formatClock, formatLongDate } from "@/lib/time";
import { countWord, formatQuantityCompact } from "@/lib/units";

const TOTAL_LABELS: Record<Range, string> = {
  today: "التالف اليوم",
  week: "التالف هالأسبوع",
  month: "التالف هالشهر",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/admin/AdminWaste.dc.html
export default function WastePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Waste searchParams={searchParams} />
    </Suspense>
  );
}

async function Waste({ searchParams }: { searchParams: SearchParams }) {
  const range = parseRange((await searchParams).range);
  const [{ from, rows, dispatchedPieces }, locations] = await Promise.all([
    listWaste(range),
    listReportLocations(),
  ]);
  const photos = new Map(
    await Promise.all(
      rows
        .filter((r) => r.photoPath)
        .map(async (r) => [r.id, await signedPhotoUrl("waste-photos", r.photoPath!)] as const),
    ),
  );

  const total = totalCakesAndPieces(rows.map((r) => ({ qty: r.qtyPieces, piecesPerCake: r.piecesPerCake })));
  const branchPieces = rows
    .filter((r) => locations.find((l) => l.id === r.locationId)?.kind === "branch")
    .reduce((s, r) => s + r.qtyPieces, 0);
  const ratio = percent(branchPieces, dispatchedPieces);
  const reasonCounts = WASTE_REASONS.map((reason) => ({
    reason,
    n: rows.filter((r) => r.reason === reason).length,
  }));
  const top = [...reasonCounts].sort((a, b) => b.n - a.n)[0];
  const byLocation = locations.map((l) => ({
    label: l.name,
    value:
      Math.round(
        rows
          .filter((r) => r.locationId === l.id)
          .reduce((s, r) => s + toCakes(r.qtyPieces, r.piecesPerCake), 0) * 10,
      ) / 10,
  }));

  return (
    <>
      <PageHeader
        title="التالف"
        subtitle={range === "today" ? "اليوم" : `من ${formatLongDate(from)} لليوم`}
        actions={
          <>
            <FilterLinks
              label="الفترة"
              current={range}
              hrefFor={(v) => `/admin/waste?range=${v}`}
              options={(["today", "week", "month"] as Range[]).map((r) => ({
                value: r,
                label: RANGE_LABELS[r],
              }))}
            />
            <ExportButton href={`/admin/export/waste?range=${range}`} />
          </>
        }
      />
      <div className="flex flex-wrap gap-3">
        <Kpi
          label={TOTAL_LABELS[range]}
          value={`${total.cakes} ${countWord(total.cakes, "cake")}`}
          note={`+ ${total.pieces} ${countWord(total.pieces, "piece")}`}
        />
        <Kpi
          label="نسبة من اللي استلمته الفروع"
          value={ratio === null ? "—" : `${ratio}%`}
          note={ratio === null ? "ما في استلام بهالفترة" : undefined}
        />
        <Kpi
          label="أكثر سبب"
          value={top && top.n > 0 ? WASTE_REASON_LABELS[top.reason] : "—"}
          note={top && top.n > 0 ? `${top.n} من ${rows.length}` : undefined}
        />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <section className="flex flex-[1_1_280px] flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-[17px] font-bold">حسب الموقع (كيكة)</h2>
          <Bars items={byLocation} />
        </section>
        <section className="min-w-0 flex-[999_1_560px] overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className={`${tableClass} min-w-[640px]`}>
            <thead>
              <tr className={theadRowClass}>
                <th scope="col" className={thClass}>
                  الوقت
                </th>
                <th scope="col" className={thClass}>
                  الموقع
                </th>
                <th scope="col" className={thClass}>
                  الصنف
                </th>
                <th scope="col" className={thClass}>
                  الكمية
                </th>
                <th scope="col" className={thClass}>
                  السبب
                </th>
                <th scope="col" className={thClass}>
                  صورة
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    ما في تالف بهالفترة.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className={`${tdClass} whitespace-nowrap text-muted`}>
                    {formatLongDate(r.occurredAt.slice(0, 10))} {formatClock(new Date(r.occurredAt))}
                  </td>
                  <td className={tdClass}>{r.locationName}</td>
                  <td className={tdClass}>
                    <span className="inline-flex items-center gap-1.5">
                      {r.dayNumber && <DayBadge day={r.dayNumber as DayNumber} size="sm" />}
                      <ProductName name={r.productName} className="font-semibold" />
                    </span>
                  </td>
                  <td className={`${tdClass} tabular-nums`}>
                    {formatQuantityCompact(r.qtyPieces, r.piecesPerCake)}
                  </td>
                  <td className={tdClass}>
                    {WASTE_REASON_LABELS[r.reason]}
                    {r.note ? ` · ${r.note}` : ""}
                    <span className="block text-xs text-muted">{r.recordedBy}</span>
                  </td>
                  <td className={tdClass}>
                    {photos.get(r.id) && (
                      <a
                        href={photos.get(r.id)!}
                        target="_blank"
                        rel="noopener"
                        className="text-sm font-semibold underline"
                      >
                        شوف
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
