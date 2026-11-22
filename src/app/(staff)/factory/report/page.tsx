import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { addDays } from "@/features/reports/format";
import { factoryCounts, factoryReport, totals } from "@/features/reports/kpis";
import { DailyColumns, Delta, StatTile, num } from "@/features/reports/components/ReportBits";
import { PERIOD_LABELS, resolvePeriod } from "@/features/reports/period";
import { businessDate, countDay, formatClock, formatLongDate } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const PRESETS = ["week", "last-week", "month", "last-month", "30d"] as const;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// تقرير المصنع لمسؤول المصنع (متل تقرير الفرع): الإنتاج، اللي طلع، التالف، نقص الجرد، وآخر الجرودات
export default function FactoryReportPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <FactoryReport searchParams={searchParams} />
    </Suspense>
  );
}

async function FactoryReport({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const staff = await requireStaff();
  const preset = typeof params.p === "string" ? params.p : undefined;
  const period = resolvePeriod(countDay(new Date()), preset === "custom" ? undefined : preset);
  const report = await factoryReport(period);
  if (!report) redirect("/");
  const locationId = staff.location!.id;
  const counts = await factoryCounts(locationId);
  const me = report.locations.find((l) => l.id === locationId);
  const was = report.previous.find((l) => l.id === locationId);
  const now = totals(report.locations);
  const before = totals(report.previous);
  const shortage = me?.consumedCakes ?? 0;
  const shortageBefore = was?.consumedCakes ?? 0;
  const onTime = pct(now.countsOnTime, now.countsExpected);

  const days = Array.from({ length: period.days }, (_, i) => addDays(period.from, i));
  const values = days.map(
    (d) => report.daily.find((x) => x.day === d && x.locationId === locationId)?.consumedCakes ?? 0,
  );
  const products = report.products
    .filter((p) => p.produced !== 0 || p.consumed !== 0 || p.waste !== 0)
    .sort((a, b) => b.produced - a.produced);

  return (
    <StaffScreen>
      <ScreenHeader
        title="تقرير المصنع"
        subtitle={`${staff.location!.name} · ${formatLongDate(period.from)} – ${formatLongDate(period.to)}`}
      />
      <nav aria-label="الفترة" className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Link
            key={p}
            href={`/factory/report?p=${p}`}
            aria-current={period.preset === p ? "page" : undefined}
            className={`flex h-11 items-center rounded-[10px] px-3 text-sm ${period.preset === p ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </nav>

      <section aria-label="المؤشرات" className="grid grid-cols-2 gap-2.5 [&>*]:min-w-0">
        <StatTile
          label="الإنتاج"
          value={num(now.produced)}
          unit="كيكة"
          delta={<Delta now={now.produced} before={before.produced} better="none" />}
        />
        <StatTile
          label="اللي طلع للفروع"
          value={num(now.dispatched)}
          unit="كيكة"
          delta={<Delta now={now.dispatched} before={before.dispatched} better="none" />}
        />
        <StatTile
          label="التالف"
          value={num(now.waste)}
          unit="كيكة"
          delta={<Delta now={now.waste} before={before.waste} better="down" />}
        />
        <StatTile
          label="نقص الجرد"
          value={num(shortage)}
          unit="كيكة"
          note="الناقص عن المتوقع بالجرد"
          delta={<Delta now={shortage} before={shortageBefore} better="down" />}
        />
        <StatTile
          label="الجرد بوقته"
          value={onTime === null ? "—" : `${onTime}%`}
          note={`${now.countsOnTime} من ${now.countsExpected} موعد`}
        />
        <StatTile label="أرقام مستحيلة" value={String(now.impossible)} note="العد أكثر من المتوقع" />
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[17px] font-bold">آخر الجرودات</h2>
        {counts.length === 0 ? (
          <p className="text-muted">ما في جرودات لسا.</p>
        ) : (
          <ul className="flex flex-col">
            {counts.map((c) => (
              <li key={c.id} className="border-t border-line-soft first:border-t-0">
                <Link
                  href={`/factory/report/count/${c.id}`}
                  className="flex min-h-12 items-center gap-3 py-2"
                >
                  <span className="flex grow flex-col">
                    <span className="font-semibold">
                      {formatLongDate(businessDate(new Date(c.startedAt)))} ·{" "}
                      {formatClock(new Date(c.startedAt))}
                    </span>
                    <span className="text-xs text-muted">
                      {c.scope === "sauce" ? "صوصات" : "كيك"}
                      {c.isOpening ? " · أول جرد" : ""}
                    </span>
                  </span>
                  {c.impossibleLines > 0 && (
                    <span className="rounded-[10px] bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger-text">
                      {c.impossibleLines} مستحيل
                    </span>
                  )}
                  <span className="text-sm text-muted tabular-nums">
                    {c.isOpening ? "—" : `نقص ${num(c.consumedCakes)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[17px] font-bold">نقص الجرد اليومي</h2>
        <DailyColumns
          days={days}
          rows={[{ label: staff.location!.name, values }]}
          max={Math.max(0, ...values)}
        />
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[17px] font-bold">الأصناف</h2>
        {products.length === 0 ? (
          <p className="text-muted">ما في أرقام بهالفترة.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-2 text-right font-semibold">
                  الصنف
                </th>
                <th scope="col" className="py-2 font-semibold">
                  الإنتاج
                </th>
                <th scope="col" className="py-2 font-semibold">
                  نقص الجرد
                </th>
                <th scope="col" className="py-2 font-semibold">
                  التالف
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-line-soft">
                  <td className="py-2">
                    <ProductName name={p.name} />
                  </td>
                  <td className="py-2 text-center tabular-nums">
                    {p.produced ? formatQuantityCompact(p.produced, p.piecesPerCake) : "—"}
                  </td>
                  <td className="py-2 text-center tabular-nums">
                    {p.consumed ? formatQuantityCompact(p.consumed, p.piecesPerCake) : "—"}
                  </td>
                  <td className={`py-2 text-center tabular-nums ${p.waste > 0 ? "text-danger-text" : ""}`}>
                    {p.waste > 0 ? formatQuantityCompact(p.waste, p.piecesPerCake) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </StaffScreen>
  );
}
