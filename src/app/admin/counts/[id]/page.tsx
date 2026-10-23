import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { ExportButton, Kpi, PageHeader } from "@/features/admin/components/AdminBits";
import { CountLinesTable } from "@/features/reports/components/CountLinesTable";
import { cakesLabel } from "@/features/reports/format";
import { getCountDetail } from "@/features/reports/queries";
import { formatScheduleTime } from "@/features/settings/schemas";
import { formatClock, formatLongDate } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

// design/admin/AdminCounts.dc.html
export default function CountDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <CountDetail params={params} />
    </Suspense>
  );
}

async function CountDetail({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getCountDetail(id);
  if (!detail) notFound();
  const { summary: c, lines, audit } = detail;

  const slotAt = c.scheduleTime ? formatScheduleTime(c.scheduleTime) : null;
  const ocrCorrections = lines.filter(
    (l) =>
      (l.ocr.wholeCakes !== null && l.ocr.wholeCakes !== l.wholeCakes) ||
      (l.ocr.loosePieces !== null && l.ocr.loosePieces !== l.loosePieces),
  );

  return (
    <>
      <Link href={`/admin/counts?location=${c.locationId}`} className="text-sm text-muted">
        الجرودات ‹ {c.locationName}
      </Link>
      <PageHeader
        title={`جرد ${c.locationName} · ${formatLongDate(c.businessDate)}${slotAt ? ` ${slotAt}` : ""}`}
        subtitle={`${c.countedBy} · ${c.method === "photo" ? "بالصورة" : "يدوي"} · بلش ${formatClock(new Date(c.startedAt))} وتأكد ${formatClock(new Date(c.confirmedAt))}`}
        actions={<ExportButton href={`/admin/export/count?id=${c.id}`} />}
      />
      <div className="flex flex-wrap gap-3">
        <Kpi
          label={detail.locationKind === "factory" ? "الفرق عن المتوقع" : "الاستهلاك من الجرد اللي قبله"}
          value={c.isOpening ? "رصيد افتتاحي" : cakesLabel(c.consumedCakes)}
        />
        <Kpi
          label="رقم مستحيل"
          value={c.impossibleLines}
          note="العد أكثر من المتوقع"
          tone={c.impossibleLines > 0 ? "danger" : undefined}
        />
        {c.method === "photo" && (
          <Kpi
            label="أرقام صححها الموظف"
            value={c.staffCorrectedLines}
            note={`من ${c.lineCount}`}
            tone="warn"
          />
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {detail.photoUrl && (
          <section
            aria-label="صورة الفورم"
            className="flex flex-[1_1_280px] flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
          >
            <h2 className="text-[17px] font-bold">صورة الفورم</h2>
            <a href={detail.photoUrl} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element -- رابط مؤقت من التخزين الخاص */}
              <img
                src={detail.photoUrl}
                alt="صورة فورم الجرد"
                className="w-full rounded-lg border border-line"
              />
            </a>
            <a
              href={detail.photoUrl}
              target="_blank"
              rel="noopener"
              className="text-sm font-semibold underline"
            >
              كبّر الصورة
            </a>
          </section>
        )}
        <CountLinesTable
          lines={lines}
          isOpening={c.isOpening}
          isFactory={detail.locationKind === "factory"}
        />
      </div>

      <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[17px] font-bold">سجل التعديلات على هالجرد</h2>
        {audit.length === 0 && ocrCorrections.length === 0 && (
          <span className="text-sm text-muted">ما في تعديلات.</span>
        )}
        <ul className="flex flex-col gap-2">
          {audit.map((a) => (
            <li key={a.id} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 text-muted">
                {formatLongDate(a.changedAt.slice(0, 10))} {formatClock(new Date(a.changedAt))}
              </span>
              <span>
                {a.changedBy} صحح <span dir="ltr">{a.productName}</span> من {a.before.wholeCakes} ك ·{" "}
                {a.before.loosePieces} ق لـ {a.after.wholeCakes} ك · {a.after.loosePieces} ق
                {a.reason ? ` (${a.reason})` : ""}
              </span>
            </li>
          ))}
          {ocrCorrections.map((l) => (
            <li key={l.lineId} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 text-muted">{formatClock(new Date(c.confirmedAt))}</span>
              <span>
                {c.countedBy} صحح <span dir="ltr">{l.productName}</span> من قراءة الصورة{" "}
                {l.ocr.wholeCakes ?? "—"} ك · {l.ocr.loosePieces ?? "—"} ق لـ {l.wholeCakes} ك ·{" "}
                {l.loosePieces} ق
              </span>
            </li>
          ))}
        </ul>
        <span className="text-[13px] text-info-text">
          الرقم الأصلي بيضل محفوظ دايماً. الموظف ما بيقدر يعدل بعد التأكيد، الأدمن بس ومع سبب.
        </span>
      </section>
    </>
  );
}
