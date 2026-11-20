import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { OrderForm } from "@/features/orders/components/OrderForm";
import { editMinutesLeft } from "@/features/orders/logic";
import { factoryLoosePiecesEnabled, loadDocuments, productsForBranch } from "@/features/orders/queries";
import { DAY_NAMES, dayNumberOf, type DayNumber } from "@/lib/day-number";
import { businessDate } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

// تعديل طلب الفرع خلال ربع ساعة (بعدها استعراض بس). قاعدة البيانات بتفحص الوقت كمان.
export default function EditOrderPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <EditOrder params={params} />
    </Suspense>
  );
}

async function EditOrder({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const staff = await requireStaff();
  if (staff.location?.kind !== "branch" || !staff.roles.includes("branch_staff")) {
    return <NotForYou title="تعديل الطلب" text="تعديل الطلب لموظفين الفروع." />;
  }
  await connection();
  const { requests } = await loadDocuments({ requests: { ids: [id] }, sinceDays: 2 });
  const r = requests[0];
  if (!r || r.requestingLocationId !== staff.location.id) notFound();
  const left =
    r.status === "sent" || r.status === "pending_approval" ? editMinutesLeft(r.requestedAt, new Date()) : 0;
  if (left === 0) redirect(`/orders/${r.id}`);

  const [products, piecesEnabled] = await Promise.all([
    productsForBranch(staff.location.id, r.isPackaging ? ["packaging"] : ["cake", "sauce"]),
    r.isPackaging ? Promise.resolve(true) : factoryLoosePiecesEnabled(),
  ]);
  const tomorrowName = DAY_NAMES[((dayNumberOf(businessDate(new Date())) % 7) + 1) as DayNumber];
  const rows = Object.fromEntries(
    r.lines.map((l) => [l.productId, { wholeCakes: l.wholeCakes, loosePieces: l.loosePieces }]),
  );
  return (
    <StaffScreen>
      <ScreenHeader
        title={r.isPackaging ? "تعديل طلب التغليف" : "تعديل الطلب"}
        subtitle={`باقي ${left} ${left === 1 ? "دقيقة" : left === 2 ? "دقيقتين" : "دقايق"} للتعديل`}
        backHref={`/orders/${r.id}`}
      />
      <OrderForm
        key={r.id}
        products={products}
        tomorrowName={tomorrowName}
        packaging={r.isPackaging}
        cakesOnly={!piecesEnabled}
        edit={{ requestId: r.id, rows }}
      />
    </StaffScreen>
  );
}
