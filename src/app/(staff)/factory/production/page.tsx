import { connection } from "next/server";
import { Suspense } from "react";
import { DayBadge } from "@/components/ui/DayBadge";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { allActiveProducts, productionToday } from "@/features/orders/queries";
import { ProductionForm } from "@/features/production/components/ProductionForm";
import { productionTotals } from "@/features/production/logic";
import { shortDate, usesDate } from "@/lib/batch-label";
import { DAY_NAMES, dayNumberOf } from "@/lib/day-number";
import { businessDate, formatClock } from "@/lib/time";
import { countPhrase } from "@/lib/units";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/factory/Production
export default function ProductionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Production searchParams={searchParams} />
    </Suspense>
  );
}

async function Production({ searchParams }: { searchParams: SearchParams }) {
  const { saved } = await searchParams;
  const staff = await requireStaff();
  if (staff.location?.kind !== "factory" || !staff.roles.includes("storekeeper")) {
    return <NotForYou title="تسجيل الإنتاج" text="تسجيل الإنتاج لأمين المستودع." />;
  }
  await connection();
  const today = businessDate(new Date());
  const day = dayNumberOf(today);
  const [products, entries] = await Promise.all([allActiveProducts(), productionToday(staff.location.id)]);
  const totals = productionTotals(entries);
  const byDate = products.filter((p) => usesDate(p.shelfLifeDays));
  const last = entries.at(-1);

  return (
    <StaffScreen>
      <ScreenHeader title="تسجيل الإنتاج" />
      {saved === "1" && (
        <div
          role="status"
          className="rounded-xl border border-ok bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-text"
        >
          انحفظ الإنتاج
        </div>
      )}
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <DayBadge day={day} />
        <div className="flex flex-col">
          <strong className="text-[17px]">
            إنتاج {DAY_NAMES[day]} · رقم {day}
          </strong>
          <span className="text-sm text-muted">اكتب الرقم {day} على كل كيكة من إنتاج اليوم</span>
        </div>
      </div>
      {byDate.length > 0 && (
        <p className="rounded-xl bg-info-soft px-3 py-2.5 text-sm text-info-text">
          <span dir="auto">{byDate.map((p) => p.nameEn).join("، ")}</span>: بتعيش أكثر من أسبوع، فاكتب عليها
          التاريخ <strong>{shortDate(today)}</strong> بدل الرقم.
        </p>
      )}
      {last && (
        <p className="text-sm text-muted">
          سجلت اليوم {entries.length > 1 ? `${entries.length} مرات، آخرها` : ""} الساعة{" "}
          {formatClock(new Date(last.recorded_at))}: {countPhrase(totals.cakes, "cake")}
          {totals.pieces > 0 ? ` و${countPhrase(totals.pieces, "piece")}` : ""}. اللي بتدخله هون بينضاف عليه.
        </p>
      )}
      <ProductionForm key={new Date().toISOString()} products={products} dayNumber={day} />
    </StaffScreen>
  );
}
