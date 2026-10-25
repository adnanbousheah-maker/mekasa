import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { DispatchForm } from "@/features/orders/components/DispatchForm";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { allActiveProducts, destinationsFrom, loadDocuments } from "@/features/orders/queries";
import { isPackagingKeeper, packagingStore } from "@/features/packaging/queries";
import { formatClock } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// إخراج من مستودع التغليف لفرع (بطلب أو بدون)
export default function PackagingDispatchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <PackagingDispatch searchParams={searchParams} />
    </Suspense>
  );
}

async function PackagingDispatch({ searchParams }: { searchParams: SearchParams }) {
  const { request: requestParam } = await searchParams;
  const staff = await requireStaff();
  if (!isPackagingKeeper(staff)) {
    return <NotForYou title="إخراج تغليف" text="الإخراج من المستودع لأمين التغليف." />;
  }
  const store = await packagingStore();
  if (!store) return <NotForYou title="إخراج تغليف" text="ما في مستودع تغليف فعّال." />;
  const requestId = typeof requestParam === "string" && UUID.test(requestParam) ? requestParam : null;
  const [products, destinations, docs] = await Promise.all([
    allActiveProducts("packaging"),
    destinationsFrom({ id: store.id, kind: "packaging" }),
    requestId
      ? loadDocuments({
          requests: { ids: [requestId], supplyingLocationId: store.id, statuses: ["sent"] },
          sinceDays: 30,
        })
      : null,
  ]);
  const request = docs?.requests[0] ?? null;
  if (requestId && !request) return <NotForYou title="إخراج تغليف" text="هالطلب طلع قبل أو انلغى." />;

  return (
    <StaffScreen>
      <ScreenHeader
        title="إخراج تغليف"
        subtitle={
          request
            ? `من طلب ${request.requestedBy} · ${formatClock(new Date(request.requestedAt))}`
            : "بدون طلب"
        }
        backHref="/packaging"
      />
      <DispatchForm
        key={new Date().toISOString()}
        products={products}
        destinations={destinations}
        initialDestination={request?.requestingLocationId ?? null}
        requestId={request?.id ?? null}
        batches={null}
        withDriver
        doneHref="/packaging"
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
