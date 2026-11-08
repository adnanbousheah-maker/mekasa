import "server-only";
import { cache } from "react";
import { linesSummary } from "@/features/orders/logic";
import { loadDocuments } from "@/features/orders/queries";
import { amount } from "@/features/raw/logic";
import { listRawMaterials } from "@/features/raw/queries";
import { addDays } from "@/features/reports/format";
import {
  belowMinByLocation,
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
import { listStaff } from "@/features/staff/queries";
import { requireManager } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { businessDate, formatClock, formatLongDate } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

// "لازم تتصرف": كل الشي العالق بالنظام بقائمة وحدة، مرتبة حسب الخطورة.
// نفس القائمة بالنظرة العامة، وبصفحة /admin/attention، والأرقام جنب القائمة الجانبية.

export type AttentionArea = "orders" | "counts" | "stock" | "factory" | "raw" | "staff";
export type Alert = {
  area: AttentionArea;
  tone: "danger" | "warn" | "info";
  title: string;
  sub: string;
  action: string;
  href: string;
};

export const AREA_LABELS: Record<AttentionArea, string> = {
  orders: "الطلب والإخراج",
  counts: "الجرودات",
  stock: "الستوك",
  factory: "المصنع والدفعات",
  raw: "المواد الأولية",
  staff: "الموظفين",
};

const TONE_RANK = { danger: 0, warn: 1, info: 2 } as const;

async function unreceivedAlertHours(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("unreceived_alert_hours").single();
  return data?.unreceived_alert_hours ?? 3;
}

/** كل البيانات اللي بتحتاجها النظرة العامة والتنبيهات. مرة وحدة لكل طلب (cache). */
export const loadOverviewData = cache(async () => {
  // الصلاحية أول (وهي بتعمل connection()، فالوقت تحت وقت الطلب مش وقت البناء)
  await requireManager();
  const now = new Date();
  const today = businessDate(now);
  const [
    locations,
    products,
    stock,
    par,
    slots,
    batches,
    lastCounts,
    yesterdayUse,
    weekUse,
    docs,
    alertHours,
    raw,
    belowMin,
    staff,
  ] = await Promise.all([
    listReportLocations(),
    listReportProducts(),
    stockByProduct(),
    parLevels(),
    slotsToday(),
    factoryBatchAlerts(),
    lastCountByLocation(),
    consumptionSince(addDays(today, -1), addDays(today, -1)),
    consumptionSince(addDays(today, -6)),
    loadDocuments({ requests: { statuses: ["pending_approval", "sent"] }, dispatches: {}, sinceDays: 14 }),
    unreceivedAlertHours(),
    listRawMaterials(),
    belowMinByLocation(),
    listStaff(),
  ]);
  return {
    now,
    today,
    locations,
    products,
    stock,
    par,
    slots,
    batches,
    lastCounts,
    yesterdayUse,
    weekUse,
    docs,
    alertHours,
    raw,
    belowMin,
    staff,
  };
});

export type OverviewData = Awaited<ReturnType<typeof loadOverviewData>>;

export function buildAlerts(data: OverviewData): Alert[] {
  const {
    now,
    today,
    locations,
    products,
    stock,
    par,
    slots,
    batches,
    lastCounts,
    docs,
    alertHours,
    raw,
    belowMin,
  } = data;
  const alerts: Alert[] = [];
  for (const d of docs.dispatches.filter(
    (d) => d.status === "in_transit" && d.hoursInTransit >= alertHours,
  )) {
    alerts.push({
      area: "orders",
      tone: "danger",
      title: `إخراج ${d.toName} ما انستلم من ${Math.floor(d.hoursInTransit)} ساعة`,
      sub: `طلع ${formatLongDate(d.dispatchedAt.slice(0, 10))} ${formatClock(new Date(d.dispatchedAt))} · ${linesSummary(d.lines, d.isPackaging)}`,
      action: "تابع",
      href: `/admin/orders?filter=road&id=${d.requestId ?? d.id}`,
    });
  }
  for (const d of docs.dispatches.filter((d) =>
    d.lines.some((l) => l.received && l.received.qtyPieces !== l.qtyPieces && !l.received.resolution),
  )) {
    const line = d.lines.find((l) => l.received && l.received.qtyPieces !== l.qtyPieces)!;
    alerts.push({
      area: "orders",
      tone: "danger",
      title: `فرق استلام بـ${d.toName}`,
      sub: `${line.productName}: طلع ${formatQuantityCompact(line.qtyPieces, line.piecesPerCake)} ووصل ${formatQuantityCompact(line.received!.qtyPieces, line.piecesPerCake)}${line.received!.note ? ` · ${line.received!.note}` : ""}`,
      action: "شوف",
      href: `/admin/orders?filter=diff&id=${d.requestId ?? d.id}`,
    });
  }
  const lowRaw = raw.filter((m) => m.belowMin);
  if (lowRaw.length > 0) {
    alerts.push({
      area: "raw",
      tone: "warn",
      title: `${lowRaw.length === 1 ? "مادة وحدة" : lowRaw.length === 2 ? "مادتين" : `${lowRaw.length} مواد`} تحت الحد الأدنى`,
      sub: lowRaw
        .slice(0, 3)
        .map((m) => `${m.name} ${amount(m.qty, m.baseUnit)} من ${amount(m.minQty, m.baseUnit)}`)
        .join(" · "),
      action: "شوف",
      href: "/admin/raw",
    });
  }
  for (const r of docs.requests.filter((r) => r.status === "pending_approval")) {
    alerts.push({
      area: "orders",
      tone: "warn",
      title: `طلب ${r.fromName} بانتظار موافقتك`,
      sub: linesSummary(r.lines, r.isPackaging),
      action: "وافق",
      href: `/admin/orders?filter=wait&id=${r.id}`,
    });
  }
  for (const b of batches) {
    alerts.push({
      area: "factory",
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
      area: "counts",
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
        area: "counts",
        tone: "danger",
        title: `${c.impossibleLines} رقم مستحيل بجرد ${c.locationName}`,
        sub: "العد أكثر من المتوقع: يا غلط بالعد، يا استلام ما انسجل",
        action: "راجع",
        href: `/admin/counts/${c.id}`,
      });
    }
  }
  for (const loc of belowMin) {
    const n = loc.items.length;
    alerts.push({
      area: "stock",
      tone: "danger",
      title: `${n} ${n >= 3 && n <= 10 ? "أصناف" : "صنف"} بـ${loc.locationName} تحت الحد الأدنى`,
      sub: loc.items
        .slice(0, 4)
        .map((i) =>
          loc.kind === "packaging"
            ? `${i.name} ${i.qty} حبة`
            : `${i.name} ${formatQuantityCompact(i.qty, i.ppc)}`,
        )
        .join(" · "),
      action: "شوف",
      href: `/admin/settings?tab=par&loc=${loc.locationId}`,
    });
  }
  for (const loc of locations.filter((l) => l.kind === "branch")) {
    const low = products.filter((p) => {
      const target = par.get(p.id)?.get(loc.id);
      return p.isActive && target !== undefined && (stock.get(p.id)?.get(loc.id) ?? 0) < target;
    });
    if (low.length > 0 && lastCounts.has(loc.id)) {
      alerts.push({
        area: "stock",
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

  for (const s of data.staff.filter((s) => s.isActive && s.isLocked)) {
    alerts.push({
      area: "staff",
      tone: "warn",
      title: `${s.fullName} مقفول`,
      sub: "محاولات دخول غلط. إذا هو نسي الرمز، أعطيه رمز جديد",
      action: "رمز جديد",
      href: `/admin/staff`,
    });
  }

  return alerts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => TONE_RANK[x.a.tone] - TONE_RANK[y.a.tone] || x.i - y.i)
    .map((x) => x.a);
}

/** "لازم تتصرف" + عدد كل قسم (للقائمة الجانبية). */
export const attention = cache(async () => {
  const alerts = buildAlerts(await loadOverviewData());
  const counts = Object.fromEntries(
    (Object.keys(AREA_LABELS) as AttentionArea[]).map((area) => [
      area,
      alerts.filter((a) => a.area === area && a.tone !== "info").length,
    ]),
  ) as Record<AttentionArea, number>;
  return { alerts, counts, urgent: alerts.filter((a) => a.tone !== "info").length };
});
