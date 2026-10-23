import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { DispatchForm } from "@/features/orders/components/DispatchForm";
import { NotForYou } from "@/features/orders/components/OrderBits";
import {
  allActiveProducts,
  destinationsFrom,
  factoryBatchStock,
  loadDocuments,
} from "@/features/orders/queries";
import { formatClock } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/factory/Dispatch
export default function DispatchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Dispatch searchParams={searchParams} />
    </Suspense>
  );
}

async function Dispatch({ searchParams }: { searchParams: SearchParams }) {
  const { request: requestParam } = await searchParams;
  const staff = await requireStaff();
  if (staff.location?.kind !== "factory" || !staff.roles.includes("dispatcher")) {
    return <NotForYou title="إخراج" text="الإخراج لموظف الإخراج بالمصنع." />;
  }
  const requestId = typeof requestParam === "string" && UUID.test(requestParam) ? requestParam : null;
  const [products, destinations, batches, docs] = await Promise.all([
    allActiveProducts(),
    destinationsFrom(staff.location),
    factoryBatchStock(staff.location.id),
    requestId ? loadDocuments({ requests: { ids: [requestId], statuses: ["sent"] }, sinceDays: 30 }) : null,
  ]);
  const request = docs?.requests[0] ?? null;
  if (requestId && !request) return <NotForYou title="إخراج" text="هالطلب طلع قبل أو انلغى." />;

  return (
    <StaffScreen>
      <ScreenHeader
        title="إخراج"
        subtitle={
          request
            ? `من طلب ${request.requestedBy} · ${formatClock(new Date(request.requestedAt))}`
            : "بدون طلب"
        }
        backHref="/factory/requests"
      />
      <DispatchForm
        key={new Date().toISOString()}
        products={products}
        destinations={destinations}
        initialDestination={request?.requestingLocationId ?? null}
        requestId={request?.id ?? null}
        batches={batches}
        doneHref="/factory/requests"
        initialLines={(request?.lines ?? []).map((l) => ({
          productId: l.productId,
          requestLineId: l.lineId,
          requestedPieces: l.qtyPieces,
          wholeCakes: l.wholeCakes,
          loosePieces: l.loosePieces,
        }))}
      />
    </StaffScreen>
  );
}
