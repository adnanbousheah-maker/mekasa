import Link from "next/link";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { FactoryCountForm } from "@/features/counts/components/FactoryCountForm";
import { NotCounting, countTitle } from "@/features/counts/components/CountBits";
import { getCountContext, listCountProducts, listFactoryBatches } from "@/features/counts/queries";
import { businessDate } from "@/lib/time";

// design/branch/CountMethod (الفرع)، وdesign/factory/FactoryCount (المصنع، جرد أعمى يدوي)
export default function CountPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Count />
    </Suspense>
  );
}

async function Count() {
  const context = await getCountContext();
  if (!context) return <NotCounting />;
  const { location, slot } = context;

  if (location.kind === "factory") {
    const [products, batches] = await Promise.all([listCountProducts(), listFactoryBatches(location.id)]);
    const now = new Date();
    return (
      <StaffScreen>
        <ScreenHeader
          title={slot ? countTitle(slot.timeOfDay) : "جرد ستوك المصنع"}
          subtitle="عدّ كل رقم لحاله"
        />
        <p className="text-[13px] leading-relaxed text-muted">
          ما بنعرض الكمية المتوقعة مشان العد يكون حقيقي. الفرق بيطلع للمدير بعد التأكيد.
        </p>
        <FactoryCountForm
          key={now.toISOString()}
          products={products}
          batches={batches}
          today={businessDate(now)}
          shelfLifeDays={context.shelfLifeDays}
          scheduleId={slot?.scheduleId ?? null}
          startedAt={now.toISOString()}
        />
      </StaffScreen>
    );
  }

  return (
    <StaffScreen>
      <ScreenHeader title={slot ? countTitle(slot.timeOfDay) : "جرد"} subtitle={`فرع ${location.name}`} />
      <p className="text-lg font-semibold">كيف بدك تجرد؟</p>
      {context.photoCountEnabled && (
        <Link
          href="/count/photo"
          className="flex flex-col gap-4 rounded-[20px] border-2 border-ink bg-surface p-6"
        >
          <div className="flex items-start justify-between">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-quiet">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
            <span className="rounded-xl bg-ink px-3 py-1 text-[13px] font-semibold text-white">الأسرع</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[22px] font-bold">صوّر الفورم</span>
            <span className="text-[15px] leading-relaxed text-muted">
              عبّي الفورم الورقي بالقلم، وصوّره، والتطبيق بيقرأ الأرقام لحاله
            </span>
          </div>
        </Link>
      )}
      <Link
        href="/count/manual"
        className={`flex flex-col gap-4 rounded-[20px] bg-surface p-6 ${context.photoCountEnabled ? "border border-line" : "border-2 border-ink"}`}
      >
        <span className="flex size-16 items-center justify-center rounded-2xl bg-quiet text-muted">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2" />
          </svg>
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[22px] font-bold">أدخل يدوي</span>
          <span className="text-[15px] leading-relaxed text-muted">اكتب العدد لكل صنف مباشرة على الجوال</span>
        </div>
      </Link>
    </StaffScreen>
  );
}
