import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { getCountSummary } from "@/features/counts/queries";
import { formatScheduleTime } from "@/features/settings/schemas";
import { formatClock } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/branch/CountDone
export default function CountDonePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <CountDone searchParams={searchParams} />
    </Suspense>
  );
}

async function CountDone({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  if (typeof id !== "string" || !UUID.test(id)) notFound();
  const summary = await getCountSummary(id);
  if (!summary) notFound();

  const confirmed = new Date(summary.confirmedAt);
  const what = summary.scheduleTime ? `جرد الساعة ${formatScheduleTime(summary.scheduleTime)}` : "الجرد";
  const stats = [
    [summary.productCount, "صنف"],
    [summary.cakes, "كيكة"],
    [summary.pieces, "قطعة"],
  ] as const;

  return (
    <StaffScreen>
      <div className="flex grow flex-col items-center gap-5 pt-24">
        <div className="flex size-[120px] items-center justify-center rounded-full bg-ok-soft">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="تم"
            className="text-ok"
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
        </div>
        <h1 className="text-[28px] font-bold">تم الجرد</h1>
        <p className="text-center text-[17px] leading-relaxed text-muted">
          {what} لـ {summary.locationName} انحفظ
          <br />
          الساعة {formatClock(confirmed)}
        </p>
        <div className="mt-2 grid w-full grid-cols-3 gap-2.5">
          {stats.map(([n, label]) => (
            <div
              key={label}
              className="flex flex-col items-center gap-0.5 rounded-[14px] border border-line bg-surface px-2 py-3.5"
            >
              <span className="text-2xl font-bold">{n}</span>
              <span className="text-[13px] text-muted">{label}</span>
            </div>
          ))}
        </div>
        <div className="grow" />
        <ButtonLink href="/">رجوع للرئيسية</ButtonLink>
      </div>
    </StaffScreen>
  );
}
