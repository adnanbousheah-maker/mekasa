import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { DispatchForm } from "@/features/orders/components/DispatchForm";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { allActiveProducts, destinationsFrom } from "@/features/orders/queries";

// تحويل من فرع لفرع، أو إرجاع للمصنع (نفس الإخراج، حسب الإعدادات)
export default function TransferPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Transfer />
    </Suspense>
  );
}

async function Transfer() {
  const staff = await requireStaff();
  if (staff.location?.kind !== "branch" || !staff.roles.includes("branch_staff")) {
    return <NotForYou title="تحويل" text="التحويل من الفروع بس." />;
  }
  const [products, destinations] = await Promise.all([allActiveProducts(), destinationsFrom(staff.location)]);
  if (destinations.length === 0)
    return <NotForYou title="تحويل" text="التحويل والإرجاع موقوفين بالإعدادات." />;
  return (
    <StaffScreen>
      <ScreenHeader title="تحويل أو إرجاع" subtitle="اختار الوجهة والكميات" backHref="/orders" />
      <DispatchForm
        key={new Date().toISOString()}
        products={products}
        destinations={destinations}
        initialDestination={null}
        requestId={null}
        initialLines={[]}
        batches={null}
        doneHref="/orders"
      />
    </StaffScreen>
  );
}
