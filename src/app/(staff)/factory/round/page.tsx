import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { RoundForm } from "@/features/orders/components/RoundForm";
import { factoryBatchStock, loadDocuments } from "@/features/orders/queries";

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
  const [{ requests }, batches] = await Promise.all([
    loadDocuments({
      requests: { supplyingLocationId: staff.location.id, statuses: ["sent"] },
      sinceDays: 14,
    }),
    factoryBatchStock(staff.location.id),
  ]);

  return (
    <StaffScreen>
      <ScreenHeader title="توزيع اليوم" subtitle="كل طلبات الفروع مع بعض" backHref="/factory/requests" />
      {requests.length === 0 ? (
        <p className="text-muted">ما في طلبات بانتظار الإخراج.</p>
      ) : (
        <RoundForm key={new Date().toISOString()} requests={[...requests].reverse()} batches={batches} />
      )}
    </StaffScreen>
  );
}
