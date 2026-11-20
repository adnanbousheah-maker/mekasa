import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import {
  NotForYou,
  REQUEST_STATUS_LABELS,
  STATUS_TONES,
  dayLabel,
} from "@/features/orders/components/OrderBits";
import { editMinutesLeft } from "@/features/orders/logic";
import { loadDocuments } from "@/features/orders/queries";
import { formatClock } from "@/lib/time";
import { formatQuantity, SAUCE_UNIT } from "@/lib/units";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

// استعراض طلب الفرع (قراءة بس). التعديل خلال ربع ساعة من صفحة التعديل.
export default function RequestViewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <RequestView params={params} />
    </Suspense>
  );
}

async function RequestView({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const staff = await requireStaff();
  await connection();
  const now = new Date();
  const { requests } = await loadDocuments({ requests: { ids: [id] }, sinceDays: 90 });
  const r = requests[0];
  if (!r) notFound();
  if (r.requestingLocationId !== staff.location?.id) {
    return <NotForYou title="الطلب" text="هالطلب مش لفرعك." />;
  }
  const left =
    r.status === "sent" || r.status === "pending_approval" ? editMinutesLeft(r.requestedAt, now) : 0;
  const amount = (pieces: number, ppc: number | null, kind: string) =>
    kind === "sauce"
      ? `${pieces} ${SAUCE_UNIT}`
      : r.isPackaging
        ? `${pieces} حبة`
        : formatQuantity(pieces, ppc);

  return (
    <StaffScreen>
      <ScreenHeader
        title={`${r.isPackaging ? "طلب تغليف" : "طلبية"} ${dayLabel(r.requestedAt, now)}`}
        subtitle={`انبعت ${formatClock(new Date(r.requestedAt))} · ${r.requestedBy}`}
        backHref="/orders"
      />
      <span
        className={`self-start rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[r.status]}`}
      >
        {REQUEST_STATUS_LABELS[r.status]}
      </span>
      <ul aria-label="أصناف الطلب" className="flex flex-col rounded-2xl border border-line bg-surface">
        {r.lines
          .filter((l) => l.qtyPieces > 0)
          .map((l) => (
            <li
              key={l.lineId}
              className="flex justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-0"
            >
              <ProductName name={l.productName} className="font-semibold" />
              <span className="text-muted">{amount(l.qtyPieces, l.piecesPerCake, l.kind)}</span>
            </li>
          ))}
      </ul>
      {left > 0 ? (
        <Link
          href={`/order/edit/${r.id}`}
          className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white"
        >
          عدّل الطلب (باقي {left} {left === 1 ? "دقيقة" : left === 2 ? "دقيقتين" : "دقايق"})
        </Link>
      ) : (
        r.status !== "cancelled" && (
          <p className="rounded-xl bg-quiet px-3 py-2.5 text-sm text-muted">
            التعديل بس خلال ربع ساعة من الطلب. لأي تغيير احكي مع الإدارة.
          </p>
        )
      )}
    </StaffScreen>
  );
}
