import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou, dayLabel } from "@/features/orders/components/OrderBits";
import { ReceiveForm } from "@/features/orders/components/ReceiveForm";
import { loadDocuments } from "@/features/orders/queries";
import { formatClock } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

// design/branch/Receive
export default function ReceivePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Receive params={params} />
    </Suspense>
  );
}

async function Receive({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const staff = await requireStaff();
  const { dispatches } = await loadDocuments({ dispatches: { ids: [id] }, sinceDays: 90 });
  const d = dispatches[0];
  if (!d) notFound();
  if (d.status !== "in_transit") {
    return <NotForYou title="استلام" text="هالطلبية انستلمت قبل." />;
  }
  const atFactory = staff.location?.kind === "factory";
  // الاستلام للوجهة بس (والمرتجعات لأمين المستودع بالمصنع)
  if (!(d.toLocationId === staff.location?.id || (atFactory && d.kind === "return"))) {
    return <NotForYou title="استلام" text="هالطلبية مش لموقعك." />;
  }
  const { requests } = d.requestId
    ? await loadDocuments({ requests: { ids: [d.requestId] }, sinceDays: 90 })
    : { requests: [] };
  const requestLines = new Map((requests[0]?.lines ?? []).map((l) => [l.lineId, l.qtyPieces]));

  return (
    <StaffScreen>
      <ScreenHeader
        title={
          atFactory
            ? `استلام مرتجع من ${d.fromName}`
            : `${d.isPackaging ? "استلام تغليف" : "استلام طلبية"} ${dayLabel(d.dispatchedAt, new Date())}`
        }
        subtitle={`عدّ اللي وصل وأكّد كل صنف · طلع من ${d.fromName} ${formatClock(new Date(d.dispatchedAt))}`}
        backHref={atFactory ? "/factory/returns" : "/orders"}
      />
      <ReceiveForm
        packaging={d.isPackaging}
        dispatchId={d.id}
        doneHref={atFactory ? "/factory/returns" : "/orders?received=1"}
        lines={d.lines.map((l) => ({
          lineId: l.lineId,
          productName: l.productName,
          piecesPerCake: l.piecesPerCake,
          wholeCakes: l.wholeCakes,
          loosePieces: l.loosePieces,
          qtyPieces: l.qtyPieces,
          requestedPieces: d.requestId
            ? l.requestLineId
              ? (requestLines.get(l.requestLineId) ?? null)
              : null
            : undefined,
        }))}
      />
    </StaffScreen>
  );
}
