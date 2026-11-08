import Link from "next/link";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { FilterLinks, PageHeader } from "@/features/admin/components/AdminBits";
import { AREA_LABELS, attention, type AttentionArea } from "@/features/admin/attention";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const DOT = { danger: "bg-danger", warn: "bg-warn", info: "bg-info" } as const;
const TONE_LABEL = { danger: "مشكلة", warn: "انتبه", info: "معلومة" } as const;

// كل الشي العالق بمكان واحد، الأخطر أول، ومع فلتر حسب القسم.
export default function AttentionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Attention searchParams={searchParams} />
    </Suspense>
  );
}

async function Attention({ searchParams }: { searchParams: SearchParams }) {
  const { area: raw } = await searchParams;
  const area = typeof raw === "string" && raw in AREA_LABELS ? (raw as AttentionArea) : null;
  const { alerts } = await attention();
  const shown = area ? alerts.filter((a) => a.area === area) : alerts;
  const areas = (Object.keys(AREA_LABELS) as AttentionArea[]).filter((a) => alerts.some((x) => x.area === a));

  return (
    <>
      <PageHeader
        title="لازم تتصرف"
        subtitle={
          alerts.length === 0
            ? "كل شي تمام هلا"
            : "كل الشي العالق بالنظام: المشاكل أول، وبعدين اللي بدها انتباه، وبعدين المعلومات"
        }
      />
      {areas.length > 1 && (
        <FilterLinks
          label="الأقسام"
          current={area ?? ""}
          hrefFor={(v) => (v ? `/admin/attention?area=${v}` : "/admin/attention")}
          options={[
            { value: "", label: `الكل (${alerts.length})` },
            ...areas.map((a) => ({
              value: a,
              label: `${AREA_LABELS[a]} (${alerts.filter((x) => x.area === a).length})`,
            })),
          ]}
        />
      )}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-dashed p-6 text-center text-muted">
          ما في شي عالق هلا 👍
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="العالق">
          {shown.map((a, i) => (
            <li key={i}>
              <Link
                href={a.href}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:bg-quiet"
              >
                <span className={`size-2.5 shrink-0 rounded-full ${DOT[a.tone]}`} aria-hidden="true" />
                <span className="flex grow flex-col">
                  <span className="text-[15px] font-semibold">{a.title}</span>
                  <span className="text-[13px] text-muted">{a.sub}</span>
                  <span className="text-xs text-muted">
                    {AREA_LABELS[a.area]} · {TONE_LABEL[a.tone]}
                  </span>
                </span>
                <span className="text-sm font-semibold">{a.action}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
