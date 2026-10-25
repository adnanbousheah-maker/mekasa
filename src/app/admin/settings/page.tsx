import Link from "next/link";
import { Suspense } from "react";
import { GeneralTab } from "@/features/settings/components/GeneralTab";
import { PackagingTab } from "@/features/settings/components/PackagingTab";
import { ParTab } from "@/features/settings/components/ParTab";
import { ProductsTab } from "@/features/settings/components/ProductsTab";
import { listReportProducts, minLevels, parLevels, stockByProduct } from "@/features/reports/queries";
import { ScheduleCard } from "@/features/settings/components/ScheduleCard";
import { packagingStock, packagingStore } from "@/features/packaging/queries";
import {
  getSettings,
  listMinLevelLocations,
  listProducts,
  listScheduleLocations,
} from "@/features/settings/queries";

const TABS = [
  { id: "products", label: "الأصناف" },
  { id: "par", label: "الحد المطلوب والأدنى" },
  { id: "packaging", label: "التغليف" },
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
  const params = await searchParams;
  const tab = pickTab(params.tab);
  const loc = typeof params.loc === "string" ? params.loc : null;

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
          <TabContent tab={tab} loc={loc} />
        </Suspense>
      </div>
    </>
  );
}

async function TabContent({ tab, loc }: { tab: TabId; loc: string | null }) {
  if (tab === "par") {
    const [locations, cakes, packaging, par, min, stock] = await Promise.all([
      listMinLevelLocations(),
      listReportProducts(),
      listProducts("packaging"),
      parLevels(),
      minLevels(),
      stockByProduct(),
    ]);
    const current = locations.find((l) => l.id === loc) ?? locations[0];
    if (!current) return <span className="text-muted">ما في مواقع.</span>;
    return (
      <ParTab
        locations={locations}
        current={current}
        products={
          current.kind === "packaging" ? packaging.filter((p) => p.isActive) : cakes.filter((p) => p.isActive)
        }
        par={par}
        min={min}
        stock={stock}
      />
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

  if (tab === "packaging") {
    const [items, store] = await Promise.all([listProducts("packaging"), packagingStore()]);
    const stock = store ? await packagingStock(store.id) : new Map<string, number>();
    return <PackagingTab items={items} stock={stock} storeName={store?.name ?? null} />;
  }

  const [products, settings] = await Promise.all([listProducts(), getSettings()]);
  return (
    <ProductsTab
      products={products}
      defaultPieces={settings.default_pieces_per_cake}
      defaultShelfLife={settings.factory_shelf_life_days}
    />
  );
}
