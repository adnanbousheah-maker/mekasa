import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { ReturnDecision } from "@/features/orders/components/ReturnDecision";
import { listOpenReturns, shelfDates } from "@/features/orders/queries";
import { businessDate } from "@/lib/time";

// خانة المرتجعات: أمين المستودع بيقرر، يرجع للستوك أو تالف
export default function ReturnsPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Returns />
    </Suspense>
  );
}

async function Returns() {
  const staff = await requireStaff();
  if (staff.location?.kind !== "factory" || !staff.roles.includes("storekeeper")) {
    return <NotForYou title="المرتجعات" text="المرتجعات لأمين المستودع." />;
  }
  await connection();
  const items = await listOpenReturns(staff.location.id);
  const dates = shelfDates(businessDate(new Date()), 7);
  return (
    <StaffScreen>
      <ScreenHeader title="المرتجعات" subtitle="قرر لكل صنف: يرجع للستوك أو تالف" backHref="/" />
      {items.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">
          ما في مرتجعات بانتظار قرار.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <ReturnDecision key={item.receiptLineId} item={item} dates={dates} />
        ))}
      </ul>
    </StaffScreen>
  );
}
