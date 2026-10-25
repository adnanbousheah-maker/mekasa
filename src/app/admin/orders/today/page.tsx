import { connection } from "next/server";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { PageHeader } from "@/features/admin/components/AdminBits";
import { requireAdmin } from "@/features/auth/session";
import { DaySummaryTable } from "@/features/orders/components/DaySummaryTable";
import { ordersOfDay } from "@/features/orders/queries";
import { businessDate } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// طلبيات اليوم مجمّعة للإنتاج (بتنطبع)
export default function OrdersTodayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <OrdersToday searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersToday({ searchParams }: { searchParams: SearchParams }) {
  const { date: param } = await searchParams;
  await requireAdmin();
  await connection();
  const today = businessDate(new Date());
  const date = typeof param === "string" && ISO.test(param) && param <= today ? param : today;
  const summary = await ordersOfDay(date);
  return (
    <>
      <div className="print:hidden">
        <PageHeader title="طلبيات اليوم" subtitle="كل اللي طلبته الفروع، مجمّع حسب الصنف للإنتاج" />
      </div>
      <DaySummaryTable
        summary={summary}
        date={date}
        today={today}
        basePath="/admin/orders/today"
        exportHref={`/admin/export/orders-day?date=${date}`}
      />
    </>
  );
}
