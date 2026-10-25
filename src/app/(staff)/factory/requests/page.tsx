import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou, STATUS_TONES } from "@/features/orders/components/OrderBits";
import { linesSummary } from "@/features/orders/logic";
import { loadDocuments } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";
import { formatClock } from "@/lib/time";

// design/factory/FactoryRequests
export default function FactoryRequestsPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Requests />
    </Suspense>
  );
}

async function Requests() {
  const staff = await requireStaff();
  if (
    staff.location?.kind !== "factory" ||
    !(staff.roles.includes("dispatcher") || staff.roles.includes("storekeeper"))
  ) {
    return <NotForYou title="طلبات الفروع" text="هالشاشة لموظفين المصنع." />;
  }
  await connection();
  const factoryId = staff.location.id;
  const supabase = await createClient();
  const [{ requests }, { dispatches }, { data: settings }, { data: bins }] = await Promise.all([
    loadDocuments({ requests: { supplyingLocationId: factoryId, statuses: ["sent"] }, sinceDays: 14 }),
    loadDocuments({ dispatches: { fromLocationId: factoryId, statuses: ["in_transit"] }, sinceDays: 14 }),
    supabase.from("app_settings").select("unreceived_alert_hours").single(),
    supabase.from("locations").select("id").eq("kind", "returns_bin").eq("parent_location_id", factoryId),
  ]);
  const returns = bins?.length
    ? (
        await loadDocuments({
          dispatches: { toLocationId: bins[0].id, statuses: ["in_transit"] },
          sinceDays: 14,
        })
      ).dispatches
    : [];
  const alertHours = settings?.unreceived_alert_hours ?? 3;
  const isDispatcher = staff.roles.includes("dispatcher");

  return (
    <StaffScreen>
      <ScreenHeader title="طلبات الفروع" />
      <h2 className="text-[15px] font-semibold text-muted">جديدة · بانتظار الإخراج</h2>
      {requests.length === 0 && <p className="text-sm text-muted">ما في طلبات جديدة.</p>}
      {isDispatcher && requests.length > 1 && (
        <Link
          href="/factory/round"
          className="flex h-14 flex-col items-center justify-center rounded-xl border-2 border-ink bg-surface"
        >
          <span className="font-semibold">توزيع اليوم: طلّع كل الطلبات مع بعض</span>
          <span className="text-[13px] text-muted">القديم بيتوزع على الفروع بالعدل</span>
        </Link>
      )}
      <ul className="flex flex-col gap-3">
        {[...requests].reverse().map((r) => (
          <li
            key={r.id}
            aria-label={`طلب فرع ${r.fromName}`}
            className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-bold">فرع {r.fromName}</span>
              <span className="text-sm text-muted">{formatClock(new Date(r.requestedAt))}</span>
            </div>
            <span className="text-sm text-muted">
              {linesSummary(r.lines)} · طلبها {r.requestedBy}
            </span>
            {isDispatcher && (
              <Link
                href={`/factory/dispatch?request=${r.id}`}
                className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
              >
                ابدأ الإخراج
              </Link>
            )}
          </li>
        ))}
      </ul>

      <h2 className="text-[15px] font-semibold text-muted">طلعت · بانتظار الاستلام</h2>
      {dispatches.length === 0 && <p className="text-sm text-muted">ما في شي بالطريق.</p>}
      <ul className="flex flex-col gap-3">
        {dispatches.map((d) => {
          const late = d.hoursInTransit >= alertHours;
          return (
            <li key={d.id} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-[17px] font-bold">فرع {d.toName}</span>
                <span
                  className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${late ? STATUS_TONES.late : STATUS_TONES.in_transit}`}
                >
                  {late ? `ما انستلم من ${Math.floor(d.hoursInTransit)} ساعة` : "بالطريق"}
                </span>
              </div>
              <span className="text-sm text-muted">
                طلع {formatClock(new Date(d.dispatchedAt))} · {linesSummary(d.lines)}
              </span>
            </li>
          );
        })}
      </ul>

      {returns.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold text-muted">مرتجعات بالطريق للمصنع</h2>
          <ul className="flex flex-col gap-3">
            {returns.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
                <span className="text-[17px] font-bold">من فرع {d.fromName}</span>
                <span className="text-sm text-muted">{linesSummary(d.lines)}</span>
                {staff.roles.includes("storekeeper") && (
                  <Link
                    href={`/receive/${d.id}`}
                    className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
                  >
                    استلم المرتجع
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {isDispatcher && (
        <Link
          href="/factory/dispatch"
          className="flex h-12 items-center justify-center rounded-xl border border-dashed border-line-dashed text-[15px] text-muted"
        >
          إخراج بدون طلب
        </Link>
      )}
    </StaffScreen>
  );
}
