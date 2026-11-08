import Link from "next/link";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { ProductName } from "@/components/ui/ProductName";
import { ExportButton, PageHeader } from "@/features/admin/components/AdminBits";
import { requireManager } from "@/features/auth/session";
import { addDays } from "@/features/reports/format";
import { managementReport, tasksReport, totals, type LocationKpis } from "@/features/reports/kpis";
import { DailyColumns, Delta, StatTile, num } from "@/features/reports/components/ReportBits";
import { PERIOD_LABELS, PERIOD_PRESETS, resolvePeriod, wasteShare } from "@/features/reports/period";
import { countDay, formatLongDate } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// تقارير الإدارة بالكميات: المؤشرات، مقارنة الفترات والفروع، الاستهلاك اليومي، والأصناف.
export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

async function Reports({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // الصلاحية أول (بتعمل connection())، فالوقت وقت الطلب
  await requireManager();
  const today = countDay(new Date());
  const period = resolvePeriod(today, one(params.p), one(params.from), one(params.to));
  const [report, tasks] = await Promise.all([managementReport(period), tasksReport(period)]);
  const taskSum = (rows: typeof tasks.now) => ({
    expected: rows.reduce((s, r) => s + r.expected, 0),
    onTime: rows.reduce((s, r) => s + r.onTime, 0),
    done: rows.reduce((s, r) => s + r.done, 0),
  });
  const tasksNow = taskSum(tasks.now);
  const tasksBefore = taskSum(tasks.before);
  const now = totals(report.locations);
  const before = totals(report.previous);
  const branches = report.locations.filter((l) => l.kind === "branch");
  const factory = report.locations.filter((l) => l.kind === "factory");
  const prevOf = (id: string) => report.previous.find((p) => p.id === id);
  const query = new URLSearchParams({
    p: period.preset,
    ...(period.preset === "custom" ? { from: period.from, to: period.to } : {}),
  });

  const days = Array.from({ length: period.days }, (_, i) => addDays(period.from, i));
  const daily = branches.map((b) => ({
    label: b.name,
    values: days.map(
      (d) => report.daily.find((x) => x.day === d && x.locationId === b.id)?.consumedCakes ?? 0,
    ),
  }));
  const dailyMax = Math.max(0, ...daily.flatMap((d) => d.values));

  const cakes = (pieces: number, ppc: number | null) => (ppc ? pieces / ppc : 0);
  const products = report.products
    .map((p) => ({
      ...p,
      consumedCakes: cakes(p.consumed, p.piecesPerCake),
      wasteCakes: cakes(p.waste, p.piecesPerCake),
      previous: report.previousProducts.find((x) => x.id === p.id),
    }))
    .filter((p) => p.consumed !== 0 || p.waste !== 0 || p.produced !== 0);
  const byConsumption = [...products].sort((a, b) => b.consumed - a.consumed);
  const onTimeNow = pct(now.countsOnTime, now.countsExpected);
  const onTimeBefore = pct(before.countsOnTime, before.countsExpected);

  return (
    <>
      <PageHeader
        title="تقارير الإدارة"
        subtitle={`${formatLongDate(period.from)} – ${formatLongDate(period.to)} (${period.days} يوم) · مقارنة مع ${formatLongDate(period.previous.from)} – ${formatLongDate(period.previous.to)} · بالكيكات`}
        actions={<ExportButton href={`/admin/export/management?${query}`} />}
      />

      <nav aria-label="الفترة" className="flex flex-wrap items-end gap-1.5">
        {PERIOD_PRESETS.filter((p) => p !== "custom").map((p) => (
          <Link
            key={p}
            href={`/admin/reports?p=${p}`}
            aria-current={period.preset === p ? "page" : undefined}
            className={`flex h-10 items-center rounded-[10px] px-3.5 text-sm ${period.preset === p ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
        <form method="get" action="/admin/reports" className="flex flex-wrap items-end gap-1.5">
          <input type="hidden" name="p" value="custom" />
          <label className="flex flex-col gap-0.5 text-xs text-muted">
            من
            <input
              type="date"
              name="from"
              dir="ltr"
              defaultValue={period.from}
              max={today}
              className="h-10 rounded-[10px] border border-line-strong bg-surface px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-muted">
            لـ
            <input
              type="date"
              name="to"
              dir="ltr"
              defaultValue={period.to}
              max={today}
              className="h-10 rounded-[10px] border border-line-strong bg-surface px-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className={`h-10 rounded-[10px] px-3.5 text-sm ${period.preset === "custom" ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
          >
            اعرض الفترة
          </button>
        </form>
      </nav>

      <section aria-label="المؤشرات" className="flex flex-wrap gap-3">
        <StatTile
          label="الاستهلاك بالفروع"
          value={num(now.consumed)}
          unit="كيكة"
          delta={<Delta now={now.consumed} before={before.consumed} better="none" />}
          note="من الجرودات (بعد المستلم والتالف)"
        />
        <StatTile
          label="التالف (كل المواقع)"
          value={num(now.waste)}
          unit="كيكة"
          delta={<Delta now={now.waste} before={before.waste} better="down" />}
        />
        <StatTile
          label="نسبة التالف بالفروع"
          value={
            wasteShare(now.consumed, now.branchWaste) === null
              ? "—"
              : `${wasteShare(now.consumed, now.branchWaste)}%`
          }
          note={`قبل: ${wasteShare(before.consumed, before.branchWaste) ?? "—"}% · من الاستهلاك + التالف`}
        />
        <StatTile
          label="الإنتاج بالمصنع"
          value={num(now.produced)}
          unit="كيكة"
          delta={<Delta now={now.produced} before={before.produced} better="none" />}
          note={`طلع للفروع ${num(now.dispatched)} · استلمت الفروع ${num(now.received)}`}
        />
        <StatTile
          label="الجرد بوقته"
          value={onTimeNow === null ? "—" : `${onTimeNow}%`}
          note={`${now.countsOnTime} بوقته من ${now.countsExpected} موعد · قبل: ${onTimeBefore ?? "—"}%`}
        />
        {(tasksNow.expected > 0 || tasksBefore.expected > 0) && (
          <StatTile
            label="المهام المتكررة بوقتها"
            value={tasksNow.expected ? `${pct(tasksNow.onTime, tasksNow.expected)}%` : "—"}
            note={`${tasksNow.onTime} بوقتها · ${tasksNow.done} انعملت من ${tasksNow.expected} · قبل: ${pct(tasksBefore.onTime, tasksBefore.expected) ?? "—"}%`}
          />
        )}
        <StatTile
          label="فروقات الاستلام"
          value={String(now.receiptDiffs)}
          unit={`من ${now.receiptLines} سطر`}
          delta={<Delta now={now.receiptDiffs} before={before.receiptDiffs} better="down" />}
        />
        <StatTile
          label="أرقام مستحيلة بالجرد"
          value={String(now.impossible)}
          delta={<Delta now={now.impossible} before={before.impossible} better="down" />}
          note="العد أكثر من المتوقع"
        />
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[17px] font-bold">الفروع جنب بعض</h2>
        <div className="scroll-hint overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="bg-table-head text-table-head-text">
                {[
                  "الفرع",
                  "الاستهلاك",
                  "مقارنة",
                  "التالف",
                  "نسبة التالف",
                  "المستلم",
                  "الجرد بوقته",
                  "ما انعمل",
                  "فروقات الاستلام",
                  "أرقام مستحيلة",
                ].map((h, i) => (
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
              {branches.map((b) => (
                <BranchRow key={b.id} row={b} previous={prevOf(b.id)} />
              ))}
            </tbody>
          </table>
        </div>
        {factory.map((f) => (
          <p key={f.id} className="text-sm text-muted">
            <span className="font-semibold text-ink">{f.name}:</span> أنتج {num(f.producedCakes)} كيكة، طلّع{" "}
            {num(f.dispatchedCakes)}، تالف {num(f.wasteCakes)}، الجرد بوقته {f.countsOnTime} من{" "}
            {f.countsExpected}
            {f.impossibleLines > 0 && `، ${f.impossibleLines} رقم مستحيل`}.
          </p>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-bold">الاستهلاك اليومي</h2>
          <span className="text-xs text-muted">نفس المقياس لكل الفروع · مرّر على العمود لتشوف الرقم</span>
        </div>
        {dailyMax === 0 ? (
          <p className="text-sm text-muted">ما في استهلاك محسوب بهالفترة لسا (بيحتاج جردين ورا بعض).</p>
        ) : (
          <DailyColumns days={days} rows={daily} max={dailyMax} />
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[17px] font-bold">الأصناف</h2>
        {products.length === 0 ? (
          <p className="text-sm text-muted">ما في حركة أصناف بهالفترة.</p>
        ) : (
          <div className="scroll-hint overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-table-head text-table-head-text">
                  {["الصنف", "الاستهلاك", "مقارنة", "التالف", "نسبة التالف", "الإنتاج"].map((h, i) => (
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
                {byConsumption.map((p) => {
                  const share = wasteShare(p.consumed, p.waste);
                  return (
                    <tr key={p.id} className="border-t border-line-soft">
                      <th scope="row" className="px-3 py-2 text-right font-semibold">
                        <ProductName name={p.name} />
                      </th>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {p.piecesPerCake ? `${num(p.consumedCakes)} كيكة` : `${p.consumed} قطعة`}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Delta now={p.consumed} before={p.previous?.consumed ?? 0} better="none" />
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {p.waste === 0
                          ? "—"
                          : p.piecesPerCake
                            ? `${num(p.wasteCakes)} كيكة`
                            : `${p.waste} قطعة`}
                      </td>
                      <td
                        className={`px-3 py-2 text-center tabular-nums ${share !== null && share >= 5 ? "font-semibold text-danger-text" : ""}`}
                      >
                        {share === null ? "—" : `${share}%`}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {p.produced === 0
                          ? "—"
                          : p.piecesPerCake
                            ? num(cakes(p.produced, p.piecesPerCake))
                            : p.produced}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted">
        الاستهلاك = سالب تعديل الجرد (جرد سابق + دخل − طلع − تالف − جرد حالي)، بالفروع بس. نسبة التالف =
        التالف ÷ (الاستهلاك + التالف)، وأكثر من 5% بتتلون أحمر. الجرد بوقته = جرد مربوط بموعده وبلش قبل ما
        يصير متأخر. المقارنة مع نفس عدد الأيام قبل الفترة. الكيكات حسب عدد القطع الحالي لكل صنف، والأسعار
        بتنضاف بعدين.
      </p>
    </>
  );
}

function BranchRow({ row, previous }: { row: LocationKpis; previous?: LocationKpis }) {
  const share = wasteShare(row.consumedCakes, row.wasteCakes);
  const missed = Math.max(0, row.countsExpected - row.countsDone);
  return (
    <tr className="border-t border-line-soft">
      <th scope="row" className="px-3 py-2.5 text-right font-semibold">
        <Link href={`/admin/locations/${row.id}`} className="underline-offset-2 hover:underline">
          {row.name}
        </Link>
      </th>
      <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{num(row.consumedCakes)}</td>
      <td className="px-3 py-2.5 text-center">
        <Delta now={row.consumedCakes} before={previous?.consumedCakes ?? 0} better="none" />
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums">{num(row.wasteCakes)}</td>
      <td
        className={`px-3 py-2.5 text-center tabular-nums ${share !== null && share >= 5 ? "font-semibold text-danger-text" : ""}`}
      >
        {share === null ? "—" : `${share}%`}
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums">{num(row.receivedCakes)}</td>
      <td className="px-3 py-2.5 text-center tabular-nums">
        {row.countsOnTime} من {row.countsExpected}
      </td>
      <td
        className={`px-3 py-2.5 text-center tabular-nums ${missed > 0 ? "font-semibold text-warn-text" : ""}`}
      >
        {missed || "—"}
      </td>
      <td
        className={`px-3 py-2.5 text-center tabular-nums ${row.receiptDiffs > 0 ? "font-semibold text-danger-text" : ""}`}
      >
        {row.receiptDiffs || "—"}
      </td>
      <td
        className={`px-3 py-2.5 text-center tabular-nums ${row.impossibleLines > 0 ? "font-semibold text-danger-text" : ""}`}
      >
        {row.impossibleLines || "—"}
      </td>
    </tr>
  );
}
