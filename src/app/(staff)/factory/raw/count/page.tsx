import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { RawCountForm } from "@/features/raw/components/RawCountForm";
import { listRawMaterials } from "@/features/raw/queries";

// جرد المواد الأولية بالمصنع
export default function RawCountPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <RawCount />
    </Suspense>
  );
}

async function RawCount() {
  const staff = await requireStaff();
  if (staff.location?.kind !== "factory" || !staff.roles.includes("storekeeper")) {
    return <NotForYou title="جرد المواد" text="المواد الأولية لأمين المستودع." />;
  }
  const materials = await listRawMaterials();
  return (
    <StaffScreen>
      <ScreenHeader
        title="جرد المواد الأولية"
        subtitle="اكتب الموجود لكل مادة. اللي بتتركه فاضي ما بينعد."
        backHref="/factory/raw"
      />
      <RawCountForm
        key={new Date().toISOString()}
        materials={materials}
        startedAt={new Date().toISOString()}
      />
    </StaffScreen>
  );
}
