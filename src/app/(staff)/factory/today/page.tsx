import { connection } from "next/server";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { DaySummaryTable } from "@/features/orders/components/DaySummaryTable";
import { ordersOfDay } from "@/features/orders/queries";
import { businessDate } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// مجموع طلبات اليوم للإنتاج: لأمين المستودع والإخراج بالمصنع
export default function FactoryTodayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <FactoryToday searchParams={searchParams} />
    </Suspense>
  );
}

async function FactoryToday({ searchParams }: { searchParams: SearchParams }) {
  const { date: param } = await searchParams;
  const staff = await requireStaff();
  if (
    staff.location?.kind !== "factory" ||
    !(staff.roles.includes("dispatcher") || staff.roles.includes("storekeeper"))
  ) {
    return <NotForYou title="مجموع طلبات اليوم" text="هالشاشة لموظفين المصنع." />;
  }
  await connection();
  const today = businessDate(new Date());
  const date = typeof param === "string" && ISO.test(param) && param <= today ? param : today;
  return (
    <StaffScreen>
      <div className="print:hidden">
        <ScreenHeader title="مجموع طلبات اليوم" subtitle="للإنتاج: مجموع طلبات الفروع" />
      </div>
      <DaySummaryTable
        summary={await ordersOfDay(date)}
        date={date}
        today={today}
        basePath="/factory/today"
      />
    </StaffScreen>
  );
}
