import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { ReturnDecision } from "@/features/orders/components/ReturnDecision";
import { linesSummary } from "@/features/orders/logic";
import { listOpenReturns, loadDocuments, shelfDates } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const [items, { data: bins }] = await Promise.all([
    listOpenReturns(staff.location.id),
    supabase
      .from("locations")
      .select("id")
      .eq("kind", "returns_bin")
      .eq("parent_location_id", staff.location.id),
  ]);
  // المرتجعات اللي لسا بالطريق: أمين المستودع بيستلمها من هون (حتى لو ما عنده دور الإخراج)
  const incoming = bins?.length
    ? (
        await loadDocuments({
          dispatches: { toLocationId: bins[0].id, statuses: ["in_transit"] },
          sinceDays: 14,
        })
      ).dispatches
    : [];
  const dates = shelfDates(businessDate(new Date()), 7);
  return (
    <StaffScreen>
      <ScreenHeader title="المرتجعات" subtitle="قرر لكل صنف: يرجع للستوك أو تالف" backHref="/" />
      {incoming.length > 0 && (
        <ul aria-label="مرتجعات بالطريق" className="flex flex-col gap-3">
          {incoming.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
              <span className="text-[17px] font-bold">بالطريق من فرع {d.fromName}</span>
              <span className="text-sm text-muted">{linesSummary(d.lines, d.isPackaging)}</span>
              <Link
                href={`/receive/${d.id}`}
                className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
              >
                استلم المرتجع
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 && incoming.length === 0 && (
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
