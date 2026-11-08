import Link from "next/link";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import {
  ExportButton,
  Kpi,
  PageHeader,
  tableClass,
  tdClass,
  theadRowClass,
  thClass,
} from "@/features/admin/components/AdminBits";
import { canEdit, requireManager } from "@/features/auth/session";
import { signedPhotoUrl } from "@/features/photos/queries";
import { allTasksToday, recentTaskRuns, type TodayTask } from "@/features/tasks/queries";
import { formatClock, formatLongDate } from "@/lib/time";

const STATUS: Record<TodayTask["status"], { label: string; className: string }> = {
  done: { label: "✓ انعملت", className: "bg-ok-soft text-ok-text" },
  late: { label: "متأخرة", className: "bg-danger-soft text-danger-text" },
  open: { label: "لسا", className: "bg-quiet-strong text-muted" },
};

// المهام المتكررة: حالة اليوم بكل موقع، وآخر اللي انعمل بصوره
export default function TasksPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Tasks />
    </Suspense>
  );
}

async function Tasks() {
  const staff = await requireManager();
  const [today, runs] = await Promise.all([allTasksToday(), recentTaskRuns(50)]);
  const photos = new Map(
    await Promise.all(
      runs
        .filter((r) => r.photoPath)
        .map(async (r) => [r.id, await signedPhotoUrl("task-photos", r.photoPath!)] as const),
    ),
  );
  const done = today.filter((t) => t.status === "done").length;
  const late = today.filter((t) => t.status === "late").length;
  const locations = [...new Map(today.map((t) => [t.locationId, t.locationName])).entries()];

  return (
    <>
      <PageHeader
        title="المهام المتكررة"
        subtitle="تنظيف، فحص حرارة… مهام اليوم بكل موقع"
        actions={
          <>
            {canEdit(staff) && (
              <Link
                href="/admin/settings?tab=tasks"
                className="inline-flex h-10 items-center rounded-[10px] border border-line-strong bg-surface px-3.5 text-sm font-semibold"
              >
                عدّل المهام
              </Link>
            )}
            <ExportButton href="/admin/export/tasks" />
          </>
        }
      />
      <div className="flex flex-wrap gap-3">
        <Kpi label="مهام اليوم" value={today.length} />
        <Kpi
          label="انعملت"
          value={done}
          note={today.length ? `${Math.round((done / today.length) * 100)}%` : undefined}
        />
        <Kpi label="متأخرة" value={late} tone={late > 0 ? "danger" : undefined} />
      </div>

      {today.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">
          ما في مهام اليوم.{" "}
          {canEdit(staff) && (
            <Link href="/admin/settings?tab=tasks" className="font-semibold underline">
              ضيف مهمة
            </Link>
          )}
        </p>
      ) : (
        <section className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
          {locations.map(([id, name]) => {
            const rows = today.filter((t) => t.locationId === id);
            return (
              <article
                key={id}
                aria-label={name}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
              >
                <h2 className="text-[17px] font-bold">
                  {name}{" "}
                  <span className="text-sm font-normal text-muted">
                    {rows.filter((t) => t.status === "done").length} من {rows.length}
                  </span>
                </h2>
                <ul className="flex flex-col divide-y divide-line-soft">
                  {rows.map((t) => (
                    <li key={t.templateId} className="flex items-start gap-2 py-2">
                      <span className="flex grow flex-col">
                        <span className="font-semibold">{t.title}</span>
                        <span className="text-[13px] text-muted">
                          قبل <span dir="ltr">{t.dueTime}</span>
                          {t.status === "done" && ` · ${t.doneBy ?? ""} ${t.doneAt ?? ""}`}
                          {t.note && ` · ${t.note}`}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-[10px] px-2.5 py-0.5 text-[13px] font-semibold ${STATUS[t.status].className}`}
                      >
                        {STATUS[t.status].label}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[17px] font-bold">آخر اللي انعمل</h2>
        <div className="scroll-hint overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className={`${tableClass} min-w-[640px]`}>
            <thead>
              <tr className={theadRowClass}>
                <th scope="col" className={thClass}>
                  الوقت
                </th>
                <th scope="col" className={thClass}>
                  الموقع
                </th>
                <th scope="col" className={thClass}>
                  المهمة
                </th>
                <th scope="col" className={thClass}>
                  مين
                </th>
                <th scope="col" className={thClass}>
                  ملاحظة
                </th>
                <th scope="col" className={thClass}>
                  صورة
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    ما انعمل شي لسا.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className={`${tdClass} whitespace-nowrap text-muted`}>
                    {formatLongDate(r.dueDate)} {formatClock(new Date(r.doneAt))}
                  </td>
                  <td className={tdClass}>{r.locationName}</td>
                  <td className={`${tdClass} font-semibold`}>{r.title}</td>
                  <td className={tdClass}>{r.doneBy}</td>
                  <td className={tdClass}>{r.note ?? ""}</td>
                  <td className={tdClass}>
                    {photos.get(r.id) && (
                      <a
                        href={photos.get(r.id)!}
                        target="_blank"
                        rel="noopener"
                        className="text-sm font-semibold underline"
                      >
                        شوف
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
