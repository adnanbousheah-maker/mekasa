import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { RawMoveForm } from "@/features/raw/components/RawMoveForm";
import { listRawMaterials } from "@/features/raw/queries";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/factory/RawMove
export default function RawMovePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <RawMove searchParams={searchParams} />
    </Suspense>
  );
}

async function RawMove({ searchParams }: { searchParams: SearchParams }) {
  const { kind } = await searchParams;
  const staff = await requireStaff();
  if (staff.location?.kind !== "factory" || !staff.roles.includes("storekeeper")) {
    return <NotForYou title="حركة مواد أولية" text="المواد الأولية لأمين المستودع." />;
  }
  const materials = await listRawMaterials();
  return (
    <StaffScreen>
      <ScreenHeader title="حركة مواد أولية" backHref="/factory/raw" />
      <RawMoveForm
        key={`${kind}-${new Date().toISOString()}`}
        materials={materials}
        initialKind={kind === "issue" ? "issue" : "receipt"}
      />
    </StaffScreen>
  );
}
