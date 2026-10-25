import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { ProductName } from "@/components/ui/ProductName";
import { ExportButton, FilterLinks, PageHeader } from "@/features/admin/components/AdminBits";
import { ApproveRequest, ResolveDifference } from "@/features/orders/components/AdminDecisions";
import { REQUEST_STATUS_LABELS, dayLabel } from "@/features/orders/components/OrderBits";
import { linesSummary, receiptDifference, requestVsDispatch } from "@/features/orders/logic";
import { loadDocuments, type DispatchDoc, type RequestDoc } from "@/features/orders/queries";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatClock } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/admin/AdminOrders.dc.html
export default function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

type Move = {
  id: string;
  request: RequestDoc | null;
  dispatch: DispatchDoc | null;
  at: string;
  state: "approve" | "wait" | "road" | "late" | "diff" | "ok" | "cancelled";
};

const BADGES: Record<Move["state"], [string, string]> = {
  approve: ["بانتظار موافقتك", "bg-warn-chip text-warn-text"],
  wait: ["بانتظار الإخراج", "bg-quiet-strong text-table-head-text"],
  road: ["بالطريق", "bg-info-soft text-info-text"],
  late: ["ما انستلم", "bg-danger-soft text-danger-text"],
  diff: ["فرق بالاستلام", "bg-danger-soft text-danger-text"],
  ok: ["مستلم", "bg-ok-soft text-ok-text"],
  cancelled: ["ملغي", "bg-quiet text-muted"],
};

function hasOpenDifference(d: DispatchDoc): boolean {
  return d.lines.some((l) => l.received && l.received.qtyPieces !== l.qtyPieces && !l.received.resolution);
}

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await requireAdmin();
  await connection();
  const supabase = await createClient();
  const [{ requests, dispatches }, { data: settings }] = await Promise.all([
    loadDocuments({ requests: {}, dispatches: {}, sinceDays: 30 }),
    supabase.from("app_settings").select("unreceived_alert_hours").single(),
  ]);
  const alertHours = settings?.unreceived_alert_hours ?? 3;

  const moves: Move[] = [
    ...requests.map((r) => {
      const d = dispatches.find((x) => x.requestId === r.id) ?? null;
      return { id: r.id, request: r, dispatch: d, at: r.requestedAt, state: stateOf(r, d, alertHours) };
    }),
    ...dispatches
      .filter((d) => !d.requestId)
      .map((d) => ({
        id: d.id,
        request: null,
        dispatch: d,
        at: d.dispatchedAt,
        state: stateOf(null, d, alertHours),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const filter = typeof params.filter === "string" ? params.filter : "all";
  const visible = moves.filter((m) =>
    filter === "all"
      ? true
      : filter === "wait"
        ? m.state === "wait" || m.state === "approve"
        : filter === "road"
          ? m.state === "road" || m.state === "late"
          : filter === "diff"
            ? m.state === "diff"
            : filter === "move"
              ? m.dispatch?.kind === "transfer" || m.dispatch?.kind === "return"
              : true,
  );
  const selected = visible.find((m) => m.id === params.id) ?? visible[0] ?? null;
  const count = (states: Move["state"][]) => moves.filter((m) => states.includes(m.state)).length;
  const href = (f: string, id?: string) => `/admin/orders?filter=${f}${id ? `&id=${id}` : ""}`;

  return (
    <>
      <PageHeader
        title="الطلب والإخراج والاستلام"
        subtitle="كل حركة بين المواقع: طلبات الفروع، والإخراج، والتحويل، والإرجاع"
        actions={<ExportButton href="/admin/export/orders" />}
      />
      <FilterLinks
        label="فلتر"
        current={filter}
        hrefFor={(v) => href(v)}
        options={[
          { value: "all", label: "الكل" },
          { value: "wait", label: `بانتظار الإخراج (${count(["wait", "approve"])})` },
          { value: "road", label: `بالطريق (${count(["road", "late"])})` },
          { value: "diff", label: `فيها فرق (${count(["diff"])})` },
          { value: "move", label: "تحويل وإرجاع" },
        ]}
      />
      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="الحركات" className="flex max-w-[380px] min-w-0 flex-[1_1_300px] flex-col gap-2">
          {visible.length === 0 && <p className="text-sm text-muted">ما في حركات.</p>}
          {visible.map((m) => (
            <Link
              key={m.id}
              href={href(filter, m.id)}
              aria-current={m.id === selected?.id ? "true" : undefined}
              className={`flex flex-col gap-1 rounded-[14px] bg-surface p-3.5 ${m.id === selected?.id ? "border-2 border-ink" : "border border-line"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{titleOf(m)}</span>
                <span
                  className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGES[m.state][1]}`}
                >
                  {BADGES[m.state][0]}
                </span>
              </span>
              <span className="text-[13px] text-muted">{linesSummary((m.dispatch ?? m.request)!.lines)}</span>
            </Link>
          ))}
        </section>
        {selected && <MoveDetail move={selected} />}
      </div>
    </>
  );
}

function stateOf(r: RequestDoc | null, d: DispatchDoc | null, alertHours: number): Move["state"] {
  if (r?.status === "cancelled") return "cancelled";
  if (r?.status === "pending_approval") return "approve";
  if (!d) return "wait";
  if (d.status === "in_transit") return d.hoursInTransit >= alertHours ? "late" : "road";
  return hasOpenDifference(d) ? "diff" : "ok";
}

function titleOf(m: Move): string {
  const now = new Date();
  const d = m.dispatch;
  if (d?.kind === "transfer") return `تحويل: ${d.fromName} ← ${d.toName}`;
  if (d?.kind === "return") return `إرجاع: ${d.fromName} ← المصنع`;
  if (m.request)
    return `${m.request.fromName} · ${m.request.isPackaging ? "طلب تغليف" : "طلب"} ${dayLabel(m.request.requestedAt, now)} ${formatClock(new Date(m.request.requestedAt))}`;
  return `${d!.toName} · إخراج بدون طلب من ${d!.fromName} ${dayLabel(d!.dispatchedAt, now)}`;
}

function MoveDetail({ move }: { move: Move }) {
  const { request: r, dispatch: d } = move;
  const productIds = [
    ...new Set([...(r?.lines ?? []).map((l) => l.productId), ...(d?.lines ?? []).map((l) => l.productId)]),
  ];
  const rows = productIds.map((productId) => {
    const req = r?.lines.find((l) => l.productId === productId);
    const sent = d?.lines.find((l) => l.productId === productId);
    const ppc = sent?.piecesPerCake ?? req?.piecesPerCake ?? null;
    return {
      productId,
      name: sent?.productName ?? req?.productName ?? "",
      ppc,
      req,
      sent,
      got: sent?.received ?? null,
    };
  });
  const people = [
    r ? `طلبه ${r.requestedBy} ${formatClock(new Date(r.requestedAt))}` : null,
    d ? `طلّعه ${d.dispatchedBy} ${formatClock(new Date(d.dispatchedAt))}` : null,
    d?.driverName ? `السائق: ${d.driverName}` : null,
    d?.receivedBy ? `استلمه ${d.receivedBy} ${formatClock(new Date(d.receivedAt!))}` : null,
  ].filter(Boolean);
  const openDiffLines = d
    ? d.lines.filter((l) => l.received && l.received.qtyPieces !== l.qtyPieces && !l.received.resolution)
    : [];
  const q = (n: number | undefined, ppc: number | null) =>
    n === undefined ? "—" : formatQuantityCompact(n, ppc);

  return (
    <section
      aria-label="التفاصيل"
      className="flex min-w-0 flex-[999_1_520px] flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">{titleOf(move)}</h2>
          <span className="text-sm text-muted">{people.join(" · ")}</span>
        </div>
        <span className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${BADGES[move.state][1]}`}>
          {BADGES[move.state][0]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="flex flex-col rounded-xl bg-quiet p-3">
          <span className="text-muted">المطلوب</span>
          <span className="font-semibold">{r ? linesSummary(r.lines) : "بدون طلب"}</span>
        </div>
        <div className="flex flex-col rounded-xl bg-quiet p-3">
          <span className="text-muted">طلع</span>
          <span className="font-semibold">{d ? linesSummary(d.lines) : "—"}</span>
        </div>
        <div className="flex flex-col rounded-xl bg-quiet p-3">
          <span className="text-muted">وصل</span>
          <span className="font-semibold">
            {d?.receivedAt
              ? linesSummary(d.lines.map((l) => l.received ?? { wholeCakes: 0, loosePieces: 0 }))
              : "—"}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                الصنف
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                المطلوب
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                طلع
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                وصل
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                ملاحظة
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const info = d
                ? requestVsDispatch(r ? (row.req?.qtyPieces ?? 0) : null, row.sent?.qtyPieces ?? 0)
                : null;
              const problem =
                row.got && row.sent ? receiptDifference(row.sent.qtyPieces, row.got.qtyPieces, null) : null;
              return (
                <tr key={row.productId} className="border-t border-line-soft">
                  <th scope="row" className="px-3 py-2.5 text-right font-semibold">
                    <ProductName name={row.name} />
                  </th>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {r ? q(row.req?.qtyPieces, row.ppc) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-center tabular-nums ${info && r ? "bg-info-soft text-info-text" : ""}`}
                  >
                    {q(row.sent?.qtyPieces, row.ppc)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-center tabular-nums ${problem ? "bg-danger-soft font-semibold text-danger-text" : ""}`}
                  >
                    {row.got ? q(row.got.qtyPieces, row.ppc) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-muted">
                    {[
                      row.got?.damagedPieces
                        ? `تالف بالتوصيل: ${formatQuantityCompact(row.got.damagedPieces, row.ppc)}`
                        : null,
                      row.got?.note,
                      row.got?.resolution
                        ? { waste: "اعتُمد تالف", review: "للمراجعة", resolved: "انحل" }[row.got.resolution]
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-info" aria-hidden="true" />
          المصنع غيّر عن الطلب (معلومة)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-danger" aria-hidden="true" />
          وصل غير اللي طلع (مشكلة)
        </span>
      </div>
      {r && r.missing.length > 0 && (
        <p role="note" className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn-text">
          <span className="font-semibold">ما طلبوا أصناف مقترحة: </span>
          {r.missing
            .map(
              (m) =>
                `${m.productName} (المقترح ${formatQuantityCompact(m.suggestedPieces, m.piecesPerCake)})`,
            )
            .join("، ")}
        </p>
      )}
      {r?.status === "pending_approval" && <ApproveRequest requestId={r.id} />}
      {openDiffLines.length > 0 && (
        <ResolveDifference lineIds={openDiffLines.map((l) => l.received!.lineId)} />
      )}
      {r && r.status !== "pending_approval" && (
        <span className="text-xs text-muted">حالة الطلب: {REQUEST_STATUS_LABELS[r.status]}</span>
      )}
    </section>
  );
}
