import Link from "next/link";
import { Suspense } from "react";
import { GeneralTab } from "@/features/settings/components/GeneralTab";
import { ProductsTab } from "@/features/settings/components/ProductsTab";
import { ScheduleCard } from "@/features/settings/components/ScheduleCard";
import { getSettings, listProducts, listScheduleLocations } from "@/features/settings/queries";

const TABS = [
  { id: "products", label: "الأصناف" },
  { id: "par", label: "الحد المطلوب بالفروع" },
  { id: "schedule", label: "مواعيد الجرد" },
  { id: "general", label: "عام" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function pickTab(value: string | string[] | undefined): TabId {
  return TABS.find((t) => t.id === value)?.id ?? "products";
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/admin/AdminSettings.dc.html. التبويب بالرابط (?tab=) مشان يضل بعد الحفظ والرجوع.
// القراءة كلها جوا <Suspense> بالصفحة نفسها، مشان التنقل لهون يبين العنوان فوراً (cacheComponents).
export default function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1 className="text-[26px] font-bold">الإعدادات</h1>
      <Suspense fallback={<span className="text-muted">لحظة…</span>}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Settings({ searchParams }: { searchParams: SearchParams }) {
  const tab = pickTab((await searchParams).tab);

  return (
    <>
      <div role="tablist" aria-label="أقسام الإعدادات" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "products" ? "/admin/settings" : `/admin/settings?tab=${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            className={`-mb-px flex h-11 items-center border-b-[3px] px-4 text-[15px] ${tab === t.id ? "border-ink font-bold text-ink" : "border-transparent text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        <Suspense key={tab} fallback={<span className="text-muted">لحظة…</span>}>
          <TabContent tab={tab} />
        </Suspense>
      </div>
    </>
  );
}

async function TabContent({ tab }: { tab: TabId }) {
  if (tab === "par") {
    return (
      <p className="rounded-2xl border border-line bg-surface p-5 text-[15px] leading-relaxed text-muted">
        الحد المطلوب = كم بدك يكون موجود من كل صنف بالفرع بعد الاستلام. التطبيق بيقترح على الفرع يطلب الفرق،
        وبيقترح على المصنع يطلّعه. هالشاشة بتنبني مع الطلب والإخراج بالمرحلة الثانية، وحالياً 20 كيكة من كل
        صنف بكل فرع.
      </p>
    );
  }

  if (tab === "schedule") {
    const [locations, settings] = await Promise.all([listScheduleLocations(), getSettings()]);
    const reminders = `تذكير قبل ${settings.count_reminder_minutes_before} دقيقة · متأخر بعد ${settings.count_late_after_minutes} دقيقة`;
    return (
      <section className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
        {locations.map((l) => (
          <ScheduleCard
            key={l.id}
            locationId={l.id}
            name={l.name}
            times={l.times}
            note={l.kind === "factory" ? `جرد الكيك بالدفعات + المواد الأولية · ${reminders}` : reminders}
          />
        ))}
      </section>
    );
  }

  if (tab === "general") return <GeneralTab settings={await getSettings()} />;

  const [products, settings] = await Promise.all([listProducts(), getSettings()]);
  return <ProductsTab products={products} defaultPieces={settings.default_pieces_per_cake} />;
}
