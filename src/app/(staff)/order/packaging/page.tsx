import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { OrderForm } from "@/features/orders/components/OrderForm";
import { productsForBranch } from "@/features/orders/queries";

// طلب مواد تغليف من مستودع التغليف (نفس شاشة الطلب، بالحبة)
export default function PackagingOrderPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <PackagingOrder />
    </Suspense>
  );
}

async function PackagingOrder() {
  const staff = await requireStaff();
  if (staff.location?.kind !== "branch" || !staff.roles.includes("branch_staff")) {
    return <NotForYou title="طلب تغليف" text="طلب التغليف لموظفين الفروع." />;
  }
  const products = await productsForBranch(staff.location.id, "packaging");
  return (
    <StaffScreen>
      <ScreenHeader title="طلب تغليف" subtitle="اكتب عدد الحبات اللي بدك ياها من مستودع التغليف" />
      {products.length === 0 ? (
        <p className="text-muted">ما في مواد تغليف لسا. الأدمن بيضيفها من الإعدادات.</p>
      ) : (
        <OrderForm key={new Date().toISOString()} products={products} tomorrowName="" packaging />
      )}
    </StaffScreen>
  );
}
