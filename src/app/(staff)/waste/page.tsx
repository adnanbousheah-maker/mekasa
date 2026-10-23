import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { listCountProducts, listFactoryBatches } from "@/features/counts/queries";
import { WasteForm } from "@/features/waste/components/WasteForm";
import { createClient } from "@/lib/supabase/server";
import { recentDates } from "@/lib/day-number";
import { businessDate } from "@/lib/time";

// design/branch/Waste (والمصنع نفس الشاشة مع رقم الدفعة)
export default function WastePage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Waste />
    </Suspense>
  );
}

async function Waste() {
  const staff = await requireStaff();
  const location = staff.location;
  if (!location || (location.kind !== "branch" && location.kind !== "factory")) {
    return (
      <StaffScreen>
        <ScreenHeader title="تسجيل تالف" />
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">
          حسابك مش مربوط بفرع أو بالمصنع.
        </p>
      </StaffScreen>
    );
  }

  const products = await listCountProducts();
  let factory: { batches: Awaited<ReturnType<typeof listFactoryBatches>>; dates: string[] } | undefined;
  if (location.kind === "factory") {
    const supabase = await createClient();
    const [{ data: settings }, batches] = await Promise.all([
      supabase.from("app_settings").select("factory_shelf_life_days").single(),
      listFactoryBatches(location.id),
    ]);
    factory = {
      batches,
      dates: recentDates(businessDate(new Date()), settings?.factory_shelf_life_days ?? 7),
    };
  }

  return (
    <StaffScreen>
      <ScreenHeader
        title="تسجيل تالف"
        subtitle={location.kind === "factory" ? location.name : `فرع ${location.name}`}
      />
      <WasteForm products={products} factory={factory} />
    </StaffScreen>
  );
}
