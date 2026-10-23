import Link from "next/link";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { requireAdmin } from "@/features/auth/session";
import { Bars } from "@/features/admin/components/AdminBits";
import { addDays, cakesLabel, toCakes, totalCakesAndPieces } from "@/features/reports/format";
import {
  consumptionSince,
  factoryBatchAlerts,
  lastCountByLocation,
  listReportLocations,
  listReportProducts,
  parLevels,
  slotsToday,
  stockByProduct,
} from "@/features/reports/queries";
import { lateLabel } from "@/features/reminders/slots";
import { formatScheduleTime } from "@/features/settings/schemas";
import { businessDate, formatClock, formatLongDate, greetingFor } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

// design/admin/AdminOverview.dc.html
export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Overview />
    </Suspense>
  );
}

type Alert = { tone: "danger" | "warn" | "info"; title: string; sub: string; action: string; href: string };

const DOT = { danger: "bg-danger", warn: "bg-warn", info: "bg-info" } as const;
const SLOT_LABEL = { done: "تم", late: "متأخر", due: "وقته هلا", upcoming: "لسا" } as const;
const SLOT_TONE = {
  done: "bg-ok-soft text-ok-text",
  late: "bg-warn-chip text-warn-text",
  due: "bg-warn-soft text-warn-text",
  upcoming: "bg-quiet text-muted",
} as const;

async function Overview() {
  const admin = await requireAdmin();
  const now = new Date();
  const today = businessDate(now);
  const [locations, products, stock, par, slots, batches, lastCounts, yesterdayUse, weekUse] =
    await Promise.all([
      listReportLocations(),
      listReportProducts(),
      stockByProduct(),
      parLevels(),
      slotsToday(),
      factoryBatchAlerts(),
      lastCountByLocation(),
      consumptionSince(addDays(today, -1), addDays(today, -1)),
      consumptionSince(addDays(today, -6)),
    ]);
  const productById = new Map(products.map((p) => [p.id, p]));

  const cakesAt = (use: Map<string, Map<string, number>>, locationId: string) =>
    [...use.entries()].reduce(
      (s, [productId, byLoc]) =>
        s + toCakes(byLoc.get(locationId) ?? 0, productById.get(productId)?.piecesPerCake ?? null),
      0,
    );

  const alerts: Alert[] = [];
  for (const b of batches) {
    alerts.push({
      tone: "danger",
      title: b.isExpired
        ? `دفعة رقم ${b.dayNumber} خلصت مدتها بالمصنع`
        : `دفعة رقم ${b.dayNumber} آخر يوم بالمصنع`,
      sub: `${b.productName}: ${formatQuantityCompact(b.qty, b.piecesPerCake)} لازم تطلع اليوم أو تنسجل تالف`,
      action: "شوف",
      href: "/admin/stock",
    });
  }
  for (const s of slots.filter((s) => s.status === "late")) {
    const loc = locations.find((l) => l.id === s.locationId);
    const last = lastCounts.get(s.locationId);
    alerts.push({
      tone: "warn",
      title: `جرد ${loc?.name ?? ""} ${formatScheduleTime(s.timeOfDay)} ${lateLabel(new Date(s.slotAt), now)}`,
      sub: last
        ? `آخر جرد ${formatLongDate(last.businessDate)} ${formatClock(new Date(last.startedAt))}`
        : "ما في جرد قبل",
      action: "شوف",
      href: `/admin/counts?location=${s.locationId}`,
    });
  }
  for (const c of lastCounts.values()) {
    if (c.businessDate === today && c.impossibleLines > 0) {
      alerts.push({
        tone: "danger",
        title: `${c.impossibleLines} رقم مستحيل بجرد ${c.locationName}`,
        sub: "العد أكثر من المتوقع: يا غلط بالعد، يا استلام ما انسجل",
        action: "راجع",
        href: `/admin/counts/${c.id}`,
      });
    }
  }
  for (const loc of locations.filter((l) => l.kind === "branch")) {
    const low = products.filter((p) => {
      const target = par.get(p.id)?.get(loc.id);
      return p.isActive && target !== undefined && (stock.get(p.id)?.get(loc.id) ?? 0) < target;
    });
    if (low.length > 0 && lastCounts.has(loc.id)) {
      alerts.push({
        tone: "info",
        title: `${low.length} ${low.length >= 3 && low.length <= 10 ? "أصناف" : "صنف"} بـ${loc.name} تحت الحد المطلوب`,
        sub: low
          .slice(0, 4)
          .map((p) => p.nameEn)
          .join("، "),
        action: "شوف",
        href: "/admin/stock",
      });
    }
  }

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
              href={l.kind === "factory" ? "/admin/stock" : `/admin/counts?location=${l.id}`}
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
        <section className="flex flex-[1_1_280px] flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-[17px] font-bold">الاستهلاك هالأسبوع</h2>
          <span className="text-[13px] text-muted">
            الفرق بين الجرودات بعد المستلم والتالف، بالكيكة (حسب عدد القطع بكل صنف)
          </span>
          <Bars
            items={locations
              .filter((l) => l.kind === "branch")
              .map((l) => ({ label: l.name, value: Math.round(cakesAt(weekUse, l.id) * 10) / 10 }))}
          />
        </section>
      </div>
    </>
  );
}
