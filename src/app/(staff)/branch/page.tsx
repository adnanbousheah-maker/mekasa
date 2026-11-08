import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { addDays } from "@/features/reports/format";
import { branchReport, tasksReport, totals } from "@/features/reports/kpis";
import { DailyColumns, Delta, StatTile, num } from "@/features/reports/components/ReportBits";
import { PERIOD_LABELS, resolvePeriod, wasteShare } from "@/features/reports/period";
import { countDay, formatLongDate } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const PRESETS = ["week", "last-week", "month", "last-month", "30d"] as const;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// تقرير الفرع لمسؤول الفرع: نفس أرقام تقارير الإدارة، لفرعه بس (RLS)، على الجوال
export default function BranchReportPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <BranchReport searchParams={searchParams} />
    </Suspense>
  );
}

async function BranchReport({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const staff = await requireStaff();
  const preset = typeof params.p === "string" ? params.p : undefined;
  const period = resolvePeriod(countDay(new Date()), preset === "custom" ? undefined : preset);
  const [report, tasks] = await Promise.all([branchReport(period), tasksReport(period)]);
  if (!report) redirect("/");
  const locationId = staff.location!.id;
  const now = totals(report.locations);
  const before = totals(report.previous);
  const taskNow = tasks.now.find((t) => t.locationId === locationId);
  const taskBefore = tasks.before.find((t) => t.locationId === locationId);
  const share = wasteShare(now.consumed, now.branchWaste);
  const shareBefore = wasteShare(before.consumed, before.branchWaste);
  const onTime = pct(now.countsOnTime, now.countsExpected);

  const days = Array.from({ length: period.days }, (_, i) => addDays(period.from, i));
  const values = days.map((d) => report.daily.find((x) => x.day === d)?.consumedCakes ?? 0);
  const products = report.products
    .filter((p) => p.consumed !== 0 || p.waste !== 0)
    .sort((a, b) => b.consumed - a.consumed);

  return (
    <StaffScreen>
      <ScreenHeader
        title="تقرير الفرع"
        subtitle={`${staff.location!.name} · ${formatLongDate(period.from)} – ${formatLongDate(period.to)}`}
      />
      <nav aria-label="الفترة" className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Link
            key={p}
            href={`/branch?p=${p}`}
            aria-current={period.preset === p ? "page" : undefined}
            className={`flex h-11 items-center rounded-[10px] px-3 text-sm ${period.preset === p ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </nav>

      <section aria-label="المؤشرات" className="grid grid-cols-2 gap-2.5 [&>*]:min-w-0">
        <StatTile
          label="الاستهلاك"
          value={num(now.consumed)}
          unit="كيكة"
          delta={<Delta now={now.consumed} before={before.consumed} better="none" />}
        />
        <StatTile
          label="التالف"
          value={num(now.branchWaste)}
          unit="كيكة"
          delta={<Delta now={now.branchWaste} before={before.branchWaste} better="down" />}
        />
        <StatTile
          label="نسبة التالف"
          value={share === null ? "—" : `${share}%`}
          note={`قبل: ${shareBefore ?? "—"}%`}
        />
        <StatTile label="المستلم" value={num(now.received)} unit="كيكة" />
        <StatTile
          label="الجرد بوقته"
          value={onTime === null ? "—" : `${onTime}%`}
          note={`${now.countsOnTime} من ${now.countsExpected} موعد`}
        />
        <StatTile
          label="المهام بوقتها"
          value={taskNow?.expected ? `${pct(taskNow.onTime, taskNow.expected)}%` : "—"}
          note={
            taskNow?.expected
              ? `${taskNow.done} انعملت من ${taskNow.expected} · قبل: ${taskBefore?.expected ? `${pct(taskBefore.onTime, taskBefore.expected)}%` : "—"}`
              : "ما في مهام بهالفترة"
          }
        />
        <StatTile
          label="فروقات الاستلام"
          value={String(now.receiptDiffs)}
          note={`من ${now.receiptLines} سطر`}
        />
        <StatTile label="أرقام مستحيلة" value={String(now.impossible)} note="العد أكثر من المتوقع" />
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[17px] font-bold">الاستهلاك اليومي</h2>
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
                  الاستهلاك
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
                    {formatQuantityCompact(p.consumed, p.piecesPerCake)}
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
