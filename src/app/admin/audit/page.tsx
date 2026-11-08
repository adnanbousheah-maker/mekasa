import Link from "next/link";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { ExportButton, PageHeader } from "@/features/admin/components/AdminBits";
import { FilterForm } from "@/features/admin/components/FilterForm";
import { TABLE_LABELS } from "@/features/audit/format";
import { auditFilterFrom } from "@/features/audit/filter";
import { auditAuthors, listAudit } from "@/features/audit/queries";
import { formatClock, formatLongDate, businessDate } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// سجل التعديلات: مين غيّر شو وإيمتى، ومن شو لشو، والسبب.
export default function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = auditFilterFrom(params);
  const [{ rows, more }, authors] = await Promise.all([listAudit(filter), auditAuthors()]);
  const query = new URLSearchParams(
    Object.entries({
      type: filter.table ?? "",
      who: filter.staffId ?? "",
      from: filter.from ?? "",
      to: filter.to ?? "",
    }).filter(([, v]) => v),
  );
  const pageHref = (page: number) => {
    const q = new URLSearchParams(query);
    if (page > 0) q.set("page", String(page));
    const s = q.toString();
    return s ? `/admin/audit?${s}` : "/admin/audit";
  };

  return (
    <>
      <PageHeader
        title="سجل التعديلات"
        subtitle="كل تغيير على الأصناف والمواقع والموظفين والإعدادات والجرودات، مع القيمة القديمة والسبب"
        actions={<ExportButton href={`/admin/export/audit${query.size ? `?${query}` : ""}`} />}
      />
      <FilterForm
        action="/admin/audit"
        fields={[
          {
            kind: "select",
            name: "type",
            label: "النوع",
            value: filter.table ?? "",
            options: Object.entries(TABLE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            kind: "select",
            name: "who",
            label: "مين",
            value: filter.staffId ?? "",
            options: authors.map((a) => ({ value: a.id, label: a.name })),
          },
          { kind: "date", name: "from", label: "من", value: filter.from ?? "" },
          { kind: "date", name: "to", label: "لـ", value: filter.to ?? "" },
        ]}
      />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-dashed p-6 text-center text-muted">
          ما في تعديلات بهالفلاتر.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="التعديلات">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">
                  {r.action} {r.what}
                  {r.item && <span dir="auto"> · {r.item}</span>}
                </span>
                <span className="text-xs text-muted">
                  {r.who} · {formatLongDate(businessDate(new Date(r.at)))} {formatClock(new Date(r.at))}
                </span>
              </div>
              {r.changes.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-sm">
                  {r.changes.slice(0, 8).map((c) => (
                    <li key={c.field} className="flex flex-wrap gap-1.5">
                      <span className="text-muted">{c.field}:</span>
                      {r.action === "تعديل" && (
                        <>
                          <span dir="auto" className="text-danger-text line-through">
                            {c.from}
                          </span>
                          <span aria-hidden="true">←</span>
                        </>
                      )}
                      <span dir="auto" className="font-semibold">
                        {r.action === "حذف" ? c.from : c.to}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.reason && <span className="text-sm text-warn-text">السبب: {r.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="الصفحات" className="flex justify-between">
        {(filter.page ?? 0) > 0 ? (
          <Link href={pageHref((filter.page ?? 0) - 1)} className="text-sm font-semibold underline">
            → الأحدث
          </Link>
        ) : (
          <span />
        )}
        {more && (
          <Link href={pageHref((filter.page ?? 0) + 1)} className="text-sm font-semibold underline">
            الأقدم ←
          </Link>
        )}
      </nav>
    </>
  );
}
