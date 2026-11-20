import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { CountEditForm } from "@/features/counts/components/CountEditForm";
import { countEditMinutesLeft, getCountForEdit } from "@/features/counts/queries";
import { NotForYou } from "@/features/orders/components/OrderBits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

// تعديل الجرد خلال ربع ساعة من التأكيد (آخر جرد بالموقع بس). قاعدة البيانات بتفحص كمان.
export default function EditCountPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <EditCount params={params} />
    </Suspense>
  );
}

async function EditCount({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireStaff();
  await connection();
  const count = await getCountForEdit(id);
  if (!count) notFound();
  const left = countEditMinutesLeft(count.confirmedAt, new Date());
  if (left === 0 || !count.isLatest) {
    return (
      <NotForYou
        title="تعديل الجرد"
        text="التعديل بس خلال ربع ساعة من الجرد، وقبل ما ينعمل جرد بعده. لأي تصحيح احكي مع الإدارة."
      />
    );
  }
  if (count.lines.length === 0) redirect("/");
  return (
    <StaffScreen>
      <ScreenHeader
        title="تعديل الجرد"
        subtitle={`${count.locationName} · باقي ${left} ${left === 1 ? "دقيقة" : left === 2 ? "دقيقتين" : "دقايق"} للتعديل`}
        backHref="/"
      />
      <CountEditForm key={count.id} count={count} />
    </StaffScreen>
  );
}
