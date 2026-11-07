import Link from "next/link";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { NotCounting } from "@/features/counts/components/CountBits";
import { getCountContext, listCountProducts } from "@/features/counts/queries";
import { PackagingCountForm } from "@/features/packaging/components/PackagingCountForm";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// جرد الصوصات (آخر الشهر) بالفرع أو المصنع، بالحبة. بينسجل بوقت فتح الشاشة.
export default function SauceCountPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <SauceCount searchParams={searchParams} />
    </Suspense>
  );
}

async function SauceCount({ searchParams }: { searchParams: SearchParams }) {
  const [{ saved }, context] = await Promise.all([searchParams, getCountContext()]);
  if (!context || (context.location.kind !== "branch" && context.location.kind !== "factory")) {
    return <NotCounting />;
  }
  const items = await listCountProducts("sauce");
  const startedAt = new Date().toISOString();
  const subtitle =
    context.location.kind === "branch" ? `فرع ${context.location.name}` : context.location.name;

  if (saved === "1") {
    return (
      <StaffScreen>
        <ScreenHeader title="جرد الصوصات" subtitle={subtitle} />
        <p
          role="status"
          className="rounded-2xl bg-ok-soft p-5 text-center text-lg font-semibold text-ok-text"
        >
          انحفظ جرد الصوصات ✓
        </p>
        <Link
          href="/"
          className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white"
        >
          رجوع للرئيسية
        </Link>
      </StaffScreen>
    );
  }

  return (
    <StaffScreen>
      <ScreenHeader title="جرد الصوصات" subtitle={subtitle} />
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-dashed p-5 text-center text-muted">
          ما في صوصات بالقائمة لسا. المدير بيضيفها من الإعدادات.
        </p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-muted">
            عدّ كل صوص بالحبة. اللي مش موجود اكبس «ما في منه».
          </p>
          <PackagingCountForm key={startedAt} items={items} startedAt={startedAt} variant="sauce" />
        </>
      )}
    </StaffScreen>
  );
}
