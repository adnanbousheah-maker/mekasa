import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { PhotoCount } from "@/features/count-form/components/PhotoCount";
import { NotCounting, countTitle } from "@/features/counts/components/CountBits";
import { getCountContext } from "@/features/counts/queries";

// design/branch/CountCamera + CountConfirm. الجرد بينسجل بوقت فتح هالشاشة.
export default function PhotoCountPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Photo />
    </Suspense>
  );
}

async function Photo() {
  const context = await getCountContext();
  if (!context) return <NotCounting />;
  if (context.location.kind !== "branch" || !context.photoCountEnabled) redirect("/count/manual");
  const { slot } = context;
  return (
    <StaffScreen>
      <PhotoCount
        title={slot ? countTitle(slot.timeOfDay) : "الجرد"}
        scheduleId={slot?.scheduleId ?? null}
        startedAt={new Date().toISOString()}
      />
    </StaffScreen>
  );
}
