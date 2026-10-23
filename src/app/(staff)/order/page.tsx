import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { OrderForm } from "@/features/orders/components/OrderForm";
import { productsForBranch } from "@/features/orders/queries";

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
  const products = await productsForBranch(staff.location.id);
  return (
    <StaffScreen>
      <ScreenHeader title="طلب من المصنع" subtitle="الكميات مقترحة حسب الحد المطلوب، عدّلها براحتك" />
      <OrderForm products={products} />
    </StaffScreen>
  );
}
