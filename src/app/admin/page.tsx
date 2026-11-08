import Link from "next/link";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { requireManager } from "@/features/auth/session";
import { buildAlerts, loadOverviewData } from "@/features/admin/attention";
import { Bars } from "@/features/admin/components/AdminBits";
import { cakesLabel, toCakes, totalCakesAndPieces } from "@/features/reports/format";
import { linesSummary } from "@/features/orders/logic";
import { EnableNotifications } from "@/features/reminders/components/EnableNotifications";
import { formatScheduleTime } from "@/features/settings/schemas";
import { formatClock, formatLongDate, greetingFor } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

// design/admin/AdminOverview.dc.html
export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Overview />
    </Suspense>
  );
}

const DOT = { danger: "bg-danger", warn: "bg-warn", info: "bg-info" } as const;
const SLOT_LABEL = { done: "تم", late: "متأخر", due: "وقته هلا", upcoming: "لسا" } as const;
const SLOT_TONE = {
  done: "bg-ok-soft text-ok-text",
  late: "bg-warn-chip text-warn-text",
  due: "bg-warn-soft text-warn-text",
  upcoming: "bg-quiet text-muted",
} as const;

async function Overview() {
  const admin = await requireManager();
  const data = await loadOverviewData();
  const { now, today, locations, products, stock, slots, batches, lastCounts, yesterdayUse, weekUse, docs } =
    data;
  const productById = new Map(products.map((p) => [p.id, p]));

  const cakesAt = (use: Map<string, Map<string, number>>, locationId: string) =>
    [...use.entries()].reduce(
      (s, [productId, byLoc]) =>
        s + toCakes(byLoc.get(locationId) ?? 0, productById.get(productId)?.piecesPerCake ?? null),
      0,
    );

  const alerts = buildAlerts(data);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">
          {greetingFor(now)}، {admin.fullName.split(" ")[0]}
        </h1>
        <span className="text-sm text-muted">
          {formatLongDate(today)} · {formatClock(now)} ·{" "}
          {alerts.length === 0
            ? "كل شي تمام"
            : `${alerts.length} ${alerts.length <= 10 && alerts.length >= 3 ? "أشياء" : "شي"} بدها انتباهك`}
        </span>
      </header>
      <div className="max-w-md">
        <EnableNotifications
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
          label="🔔 فعّل تنبيهات الإدارة على هالجهاز (التأخير، الحد الأدنى، اللي ما انستلم)"
        />
      </div>

      <section aria-label="المواقع" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {locations.map((l) => {
          const items = products.map((p) => ({
            qty: stock.get(p.id)?.get(l.id) ?? 0,
            piecesPerCake: p.piecesPerCake,
          }));
          const total = totalCakesAndPieces(items);
          const locSlots = slots.filter((s) => s.locationId === l.id);
          const slot =
            locSlots.find((s) => s.status === "late" || s.status === "due") ??
            [...locSlots].reverse().find((s) => s.status === "done") ??
            locSlots[0];
          const lastBatch = l.kind === "factory" ? batches.find((b) => !b.isExpired) : undefined;
          const yesterday = cakesAt(yesterdayUse, l.id);
          return (
            <Link
              key={l.id}
              href={`/admin/locations/${l.id}`}
              aria-label={l.name}
              className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-[18px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[17px] font-bold">{l.name}</span>
                {slot && (
                  <span
                    className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${SLOT_TONE[slot.status]}`}
                  >
                    جرد {formatScheduleTime(slot.timeOfDay)} {SLOT_LABEL[slot.status]}
                  </span>
                )}
              </div>
              <div className="flex gap-6">
                <div className="flex flex-col">
                  <span className="text-[28px] leading-tight font-bold">{total.cakes}</span>
                  <span className="text-[13px] text-muted">كيكة</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[28px] leading-tight font-bold">{total.pieces}</span>
                  <span className="text-[13px] text-muted">قطعة</span>
                </div>
              </div>
              <span className="text-[13px] text-muted">
                {l.kind === "factory"
                  ? lastBatch
                    ? `${formatQuantityCompact(lastBatch.qty, lastBatch.piecesPerCake)} من رقم ${lastBatch.dayNumber} آخر يوم`
                    : "ما في دفعات آخر يوم"
                  : lastCounts.has(l.id)
                    ? `استهلاك أمس: ${cakesLabel(yesterday)}`
                    : "ما في جرد لسا"}
              </span>
            </Link>
          );
        })}
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <section className="flex min-w-0 flex-[999_1_480px] flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-1 text-[17px] font-bold">بدها انتباهك</h2>
          {alerts.length === 0 && <span className="text-sm text-muted">ما في شي هلا.</span>}
          {alerts.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              className="flex items-center gap-3 rounded-xl border border-line-soft px-3 py-2.5 hover:bg-quiet"
            >
              <span className={`size-2.5 shrink-0 rounded-full ${DOT[a.tone]}`} aria-hidden="true" />
              <span className="flex grow flex-col">
                <span className="text-[15px] font-semibold">{a.title}</span>
                <span className="text-[13px] text-muted">{a.sub}</span>
              </span>
              <span className="text-sm font-semibold">{a.action}</span>
            </Link>
          ))}
        </section>
        <div className="flex flex-[1_1_280px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[17px] font-bold">الاستهلاك هالأسبوع</h2>
            <span className="text-[13px] text-muted">
              الفرق بين الجرودات بعد المستلم والتالف، بالكيكة (حسب عدد القطع بكل صنف)
            </span>
            <Bars
              items={locations
                .filter((l) => l.kind === "branch")
                .map((l) => ({ label: l.name, value: Math.round(cakesAt(weekUse, l.id) * 10) / 10 }))}
              empty="لسا ما في جردين ورا بعض هالأسبوع لنحسب الاستهلاك. بعد جرد الفروع اليومي بيبين هون."
            />
          </section>
          <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold">طلبات بانتظار الإخراج</h2>
              <Link href="/admin/orders?filter=wait" className="text-sm font-semibold underline">
                الكل
              </Link>
            </div>
            {docs.requests.filter((r) => r.status === "sent").length === 0 && (
              <span className="text-sm text-muted">ما في.</span>
            )}
            {docs.requests
              .filter((r) => r.status === "sent")
              .map((r) => (
                <div key={r.id} className="flex justify-between gap-2 text-sm">
                  <span className="font-semibold">
                    {r.fromName} · {formatClock(new Date(r.requestedAt))}
                  </span>
                  <span className="text-muted">{linesSummary(r.lines, r.isPackaging)}</span>
                </div>
              ))}
          </section>
        </div>
      </div>
    </>
  );
}
