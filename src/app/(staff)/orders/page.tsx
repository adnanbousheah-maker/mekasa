import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import {
  REQUEST_STATUS_LABELS,
  STATUS_TONES,
  NotForYou,
  dayLabel,
} from "@/features/orders/components/OrderBits";
import { linesSummary } from "@/features/orders/logic";
import {
  destinationsFrom,
  loadDocuments,
  type DispatchDoc,
  type RequestDoc,
} from "@/features/orders/queries";
import { formatClock } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/branch/Orders: طلبت مقابل طلع، والحالات
export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

type Entry =
  | { kind: "request"; at: string; request: RequestDoc; dispatch: DispatchDoc | undefined }
  | { kind: "incoming"; at: string; dispatch: DispatchDoc }
  | { kind: "outgoing"; at: string; dispatch: DispatchDoc };

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const staff = await requireStaff();
  if (staff.location?.kind !== "branch") return <NotForYou title="طلبياتي" text="هالشاشة لموظفين الفروع." />;
  await connection();
  const now = new Date();
  const branchId = staff.location.id;

  const [{ requests, dispatches: incoming }, { dispatches: outgoing }, destinations] = await Promise.all([
    loadDocuments({
      requests: { requestingLocationId: branchId },
      dispatches: { toLocationId: branchId },
      sinceDays: 21,
    }),
    loadDocuments({ dispatches: { fromLocationId: branchId }, sinceDays: 21 }),
    destinationsFrom(staff.location),
  ]);

  const entries: Entry[] = [
    ...requests.map((r) => ({
      kind: "request" as const,
      at: r.requestedAt,
      request: r,
      dispatch: incoming.find((d) => d.requestId === r.id),
    })),
    ...incoming
      .filter((d) => !d.requestId)
      .map((d) => ({ kind: "incoming" as const, at: d.dispatchedAt, dispatch: d })),
    ...outgoing.map((d) => ({ kind: "outgoing" as const, at: d.dispatchedAt, dispatch: d })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const sent = (d: DispatchDoc) => linesSummary(d.lines);
  const receivedDiff = (d: DispatchDoc) => {
    const diff = d.lines.reduce((s, l) => s + ((l.received?.qtyPieces ?? l.qtyPieces) - l.qtyPieces), 0);
    if (diff === 0) return null;
    return diff < 0 ? "وصلت ناقصة" : "وصلت زايدة";
  };

  return (
    <StaffScreen>
      <ScreenHeader title="طلبياتي" />
      {params.sent === "1" && (
        <div
          role="status"
          className="rounded-xl border border-ok bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-text"
        >
          انبعت طلبك للمصنع
        </div>
      )}
      {params.received === "1" && (
        <div
          role="status"
          className="rounded-xl border border-ok bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-text"
        >
          انسجل الاستلام
        </div>
      )}
      {entries.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">ما في طلبيات لسا.</p>
      )}
      <ul className="flex flex-col gap-3">
        {entries.map((e) => {
          if (e.kind === "request") {
            const { request: r, dispatch: d } = e;
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[17px] font-bold">طلبية {dayLabel(r.requestedAt, now)}</span>
                  <span
                    className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[r.status]}`}
                  >
                    {REQUEST_STATUS_LABELS[r.status]}
                  </span>
                </div>
                {d ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col rounded-xl bg-quiet p-2.5">
                        <span className="text-muted">طلبت</span>
                        <span className="font-semibold">{linesSummary(r.lines)}</span>
                      </div>
                      <div className="flex flex-col rounded-xl bg-info-soft p-2.5">
                        <span className="text-info-text">طلع {formatClock(new Date(d.dispatchedAt))}</span>
                        <span className="font-semibold">{sent(d)}</span>
                      </div>
                    </div>
                    {d.status === "received" && receivedDiff(d) && (
                      <span className="text-sm font-semibold text-danger-text">{receivedDiff(d)}</span>
                    )}
                    {d.status === "in_transit" && (
                      <Link
                        href={`/receive/${d.id}`}
                        className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
                      >
                        استلم الطلبية
                      </Link>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted">
                    {linesSummary(r.lines)} · {formatClock(new Date(r.requestedAt))}
                  </span>
                )}
              </li>
            );
          }
          const d = e.dispatch;
          const title =
            e.kind === "incoming"
              ? d.kind === "transfer"
                ? `تحويل من ${d.fromName} · ${dayLabel(d.dispatchedAt, now)}`
                : `من المصنع بدون طلب · ${dayLabel(d.dispatchedAt, now)}`
              : d.kind === "return"
                ? `إرجاع للمصنع · ${dayLabel(d.dispatchedAt, now)}`
                : `تحويل لـ ${d.toName} · ${dayLabel(d.dispatchedAt, now)}`;
          const status = d.status === "received" ? "received" : "in_transit";
          return (
            <li key={d.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[17px] font-bold">{title}</span>
                <span
                  className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[status]}`}
                >
                  {status === "received" ? "مستلم" : "بالطريق"}
                </span>
              </div>
              <span className="text-sm text-muted">{sent(d)}</span>
              {e.kind === "incoming" && d.status === "in_transit" && (
                <Link
                  href={`/receive/${d.id}`}
                  className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
                >
                  استلم
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {destinations.length > 0 && (
        <Link
          href="/transfer"
          className="flex h-12 items-center justify-center rounded-xl border border-dashed border-line-dashed text-[15px] text-muted"
        >
          تحويل لفرع ثاني أو إرجاع للمصنع
        </Link>
      )}
    </StaffScreen>
  );
}
