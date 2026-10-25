import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { listCountProducts } from "@/features/counts/queries";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { PackagingCountForm } from "@/features/packaging/components/PackagingCountForm";
import { isPackagingKeeper, packagingStore } from "@/features/packaging/queries";

// جرد مستودع التغليف. بينسجل بوقت فتح الشاشة.
export default function PackagingCountPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <PackagingCount />
    </Suspense>
  );
}

async function PackagingCount() {
  const staff = await requireStaff();
  if (!isPackagingKeeper(staff)) {
    return <NotForYou title="جرد التغليف" text="جرد المستودع لأمين التغليف." />;
  }
  const [store, items] = await Promise.all([packagingStore(), listCountProducts("packaging")]);
  if (!store) return <NotForYou title="جرد التغليف" text="ما في مستودع تغليف فعّال." />;
  const startedAt = new Date().toISOString();
  return (
    <StaffScreen>
      <ScreenHeader title="جرد التغليف" subtitle={store.name} backHref="/packaging" />
      <PackagingCountForm key={startedAt} items={items} startedAt={startedAt} />
    </StaffScreen>
  );
}
