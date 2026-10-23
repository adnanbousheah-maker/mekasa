import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { BranchCountForm } from "@/features/counts/components/BranchCountForm";
import { NotCounting, countTitle } from "@/features/counts/components/CountBits";
import { getCountContext, listCountProducts } from "@/features/counts/queries";

// design/branch/CountConfirm (بدون صورة). الجرد بينسجل بوقت فتح هالشاشة.
export default function ManualCountPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <ManualCount />
    </Suspense>
  );
}

async function ManualCount() {
  const context = await getCountContext();
  if (!context) return <NotCounting />;
  if (context.location.kind === "factory") redirect("/count");

  const products = await listCountProducts();
  const { slot } = context;
  return (
    <StaffScreen>
      <ScreenHeader
        title={slot ? countTitle(slot.timeOfDay) : "جرد"}
        subtitle="اكتب العدد لكل صنف، وبعدين أكّد"
        backHref="/count"
      />
      <BranchCountForm
        products={products}
        scheduleId={slot?.scheduleId ?? null}
        startedAt={new Date().toISOString()}
      />
    </StaffScreen>
  );
}
