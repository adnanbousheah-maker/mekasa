import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { RoundForm } from "@/features/orders/components/RoundForm";
import {
  allActiveProducts,
  factoryBatchStock,
  factoryLoosePiecesEnabled,
  loadDocuments,
} from "@/features/orders/queries";

// توزيع اليوم: كل طلبات الفروع مرة وحدة، والقديم بالعدل
export default function RoundPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Round />
    </Suspense>
  );
}

async function Round() {
  const staff = await requireStaff();
  if (staff.location?.kind !== "factory" || !staff.roles.includes("dispatcher")) {
    return <NotForYou title="توزيع اليوم" text="التوزيع لموظف الإخراج بالمصنع." />;
  }
  await connection();
  const [{ requests }, batches, products, piecesEnabled] = await Promise.all([
    loadDocuments({
      requests: { supplyingLocationId: staff.location.id, statuses: ["sent"] },
      sinceDays: 14,
    }),
    factoryBatchStock(staff.location.id),
    allActiveProducts(),
    factoryLoosePiecesEnabled(),
  ]);
  const sizes = Object.fromEntries(products.map((p) => [p.id, p.piecesPerCake]));

  return (
    <StaffScreen>
      <ScreenHeader title="توزيع اليوم" subtitle="كل طلبات الفروع مع بعض" backHref="/factory/requests" />
      {requests.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-dashed p-5 text-center text-muted">
          ما في طلبات جديدة. أول ما فرع يطلب، بتطلع هون.
        </p>
      ) : (
        <RoundForm
          key={new Date().toISOString()}
          requests={[...requests].reverse()}
          batches={batches}
          sizes={sizes}
          cakesOnly={!piecesEnabled}
        />
      )}
    </StaffScreen>
  );
}
