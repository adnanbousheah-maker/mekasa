import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { PageHeader } from "@/features/admin/components/AdminBits";
import { requireItAdmin } from "@/features/auth/session";
import { ItControls } from "@/features/it/components/ItControls";
import { getFeatures } from "@/features/settings/features";

// سوبر أدمن IT بس: المزايا المخفية، التصفير بفترة المعاينة، ونهايتها
export default function ItPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <It />
    </Suspense>
  );
}

async function It() {
  await requireItAdmin();
  const features = await getFeatures();
  return (
    <>
      <PageHeader title="IT" subtitle={features.previewMode ? "فترة المعاينة شغّالة" : "الشغل الحقيقي"} />
      <ItControls previewMode={features.previewMode} tasks={features.tasks} />
    </>
  );
}
