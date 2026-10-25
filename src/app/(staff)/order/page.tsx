import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { OrderForm } from "@/features/orders/components/OrderForm";
import { factoryLoosePiecesEnabled, productsForBranch } from "@/features/orders/queries";
import { DAY_NAMES, dayNumberOf, type DayNumber } from "@/lib/day-number";
import { businessDate } from "@/lib/time";

// design/branch/Order
export default function OrderPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Order />
    </Suspense>
  );
}

async function Order() {
  const staff = await requireStaff();
  if (staff.location?.kind !== "branch" || !staff.roles.includes("branch_staff")) {
    return <NotForYou title="طلب من المصنع" text="الطلب من المصنع لموظفين الفروع." />;
  }
  const [products, piecesEnabled] = await Promise.all([
    productsForBranch(staff.location.id),
    factoryLoosePiecesEnabled(),
  ]);
  // الطلبية بتوصل بكرا الصبح
  const tomorrowName = DAY_NAMES[((dayNumberOf(businessDate(new Date())) % 7) + 1) as DayNumber];
  return (
    <StaffScreen>
      <ScreenHeader
        title="طلب من المصنع"
        subtitle={`الكميات مقترحة حسب استهلاك يوم ${tomorrowName} بآخر 4 أسابيع، عدّلها براحتك`}
      />
      <OrderForm
        key={new Date().toISOString()}
        products={products}
        tomorrowName={tomorrowName}
        cakesOnly={!piecesEnabled}
      />
    </StaffScreen>
  );
}
