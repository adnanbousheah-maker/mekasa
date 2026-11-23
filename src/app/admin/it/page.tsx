import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { PageHeader } from "@/features/admin/components/AdminBits";
import { requireItAdmin } from "@/features/auth/session";
import { ItControls } from "@/features/it/components/ItControls";
import { getFeatures } from "@/features/settings/features";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, kind")
    .in("kind", ["branch", "factory", "packaging"])
    .eq("is_active", true)
    .order("kind")
    .order("name");
  return (
    <>
      <PageHeader title="IT" subtitle={features.previewMode ? "فترة المعاينة شغّالة" : "الشغل الحقيقي"} />
      <ItControls
        previewMode={features.previewMode}
        tasks={features.tasks}
        requestMarkOut={features.requestMarkOut}
        locations={locations ?? []}
      />
    </>
  );
}
