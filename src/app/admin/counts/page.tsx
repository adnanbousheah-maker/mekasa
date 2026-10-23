import Link from "next/link";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import {
  ExportButton,
  FilterLinks,
  PageHeader,
  tableClass,
  tdClass,
  theadRowClass,
  thClass,
} from "@/features/admin/components/AdminBits";
import { cakesLabel } from "@/features/reports/format";
import { listCounts, listReportLocations } from "@/features/reports/queries";
import { formatScheduleTime } from "@/features/settings/schemas";
import { formatClock, formatLongDate } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function CountsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Counts searchParams={searchParams} />
    </Suspense>
  );
}

async function Counts({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const locations = await listReportLocations();
  const location = locations.find((l) => l.id === params.location)?.id ?? "";
  const counts = await listCounts({ locationId: location || undefined });

  return (
    <>
      <PageHeader
        title="الجرودات"
        subtitle="كل جرد مؤكد، مع الاستهلاك والأرقام المستحيلة"
        actions={<ExportButton href={`/admin/export/counts${location ? `?location=${location}` : ""}`} />}
      />
      <FilterLinks
        label="الموقع"
        current={location}
        hrefFor={(v) => (v ? `/admin/counts?location=${v}` : "/admin/counts")}
        options={[{ value: "", label: "الكل" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]}
      />
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className={`${tableClass} min-w-[760px]`}>
          <thead>
            <tr className={theadRowClass}>
              <th scope="col" className={thClass}>
                الجرد
              </th>
              <th scope="col" className={thClass}>
                الموظف
              </th>
              <th scope="col" className={thClass}>
                الطريقة
              </th>
              <th scope="col" className={thClass}>
                الاستهلاك
              </th>
              <th scope="col" className={thClass}>
                ملاحظات
              </th>
            </tr>
          </thead>
          <tbody>
            {counts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  ما في جرودات لسا.
                </td>
              </tr>
            )}
            {counts.map((c) => (
              <tr key={c.id} className="border-t border-line-soft">
                <th scope="row" className={`${tdClass} text-right`}>
                  <Link
                    href={`/admin/counts/${c.id}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {c.locationName} · {formatLongDate(c.businessDate)}{" "}
                    {c.scheduleTime ? formatScheduleTime(c.scheduleTime) : formatClock(new Date(c.startedAt))}
                  </Link>
                </th>
                <td className={tdClass}>{c.countedBy}</td>
                <td className={tdClass}>{c.method === "photo" ? "بالصورة" : "يدوي"}</td>
                <td className={`${tdClass} tabular-nums`}>
                  {c.isOpening ? "افتتاحي" : cakesLabel(c.consumedCakes)}
                </td>
                <td className={tdClass}>
                  <span className="flex flex-wrap gap-1.5">
                    {c.impossibleLines > 0 && (
                      <span className="rounded-[10px] bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger-text">
                        {c.impossibleLines} رقم مستحيل
                      </span>
                    )}
                    {c.staffCorrectedLines > 0 && (
                      <span className="rounded-[10px] bg-warn-chip px-2.5 py-0.5 text-xs text-warn-text">
                        الموظف صحح {c.staffCorrectedLines}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
