import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/features/count-form/components/PrintButton";
import { preparePrintableForm } from "@/features/count-form/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Promise<{ locationId: string }>;

// design/print/CountForm: A4، 4 مربعات سودا بالزوايا، QR برمز النسخة، وجدول الأصناف بخانتين.
export default function CountFormPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="p-8 text-muted">لحظة…</p>}>
      <CountForm params={params} />
    </Suspense>
  );
}

async function CountForm({ params }: { params: Params }) {
  const { locationId } = await params;
  if (!UUID.test(locationId)) notFound();
  const form = await preparePrintableForm(locationId);
  if (!form) notFound();

  const qr = await QRCode.toString(form.code, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  // الأسطر بتصغر إذا الأصناف كثيرة مشان الفورم يضل بصفحة وحدة
  const rowHeight = Math.min(37, Math.floor(760 / Math.max(form.rows.length, 1)));

  return (
    <div className="flex flex-col items-center gap-4 bg-quiet py-6 print:bg-white print:py-0">
      <style>{"@page { size: A4; margin: 0 } @media print { body { background: #fff } }"}</style>
      <div className="flex gap-3 print:hidden">
        <PrintButton />
        <Link href="/admin/settings?tab=schedule" className="flex h-12 items-center px-4 text-muted">
          رجوع
        </Link>
      </div>
      <article
        aria-label={`فورم جرد ${form.locationName}`}
        className="relative flex h-[1123px] w-[794px] flex-col gap-3.5 bg-white px-16 pt-14 pb-12 text-black shadow print:shadow-none"
      >
        {["top-6 right-6", "top-6 left-6", "bottom-6 right-6", "bottom-6 left-6"].map((pos) => (
          <span key={pos} aria-hidden="true" className={`absolute size-[22px] bg-black ${pos}`} />
        ))}
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <Logo />
            <h1 className="text-[26px] font-bold">فورم جرد · {form.locationName}</h1>
            <div className="mt-1.5 flex gap-6 text-[15px]">
              <span>التاريخ: ____ / ____</span>
              <span>الساعة: ________</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              role="img"
              aria-label="رمز QR للموقع"
              className="size-24"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <span dir="ltr" className="text-[11px] font-semibold">
              {form.code}
            </span>
          </div>
        </header>
        <div className="flex justify-between border-t-2 border-black pt-2 text-[13px]">
          <span>اكتب الرقم واضح جوا المربع، والمربع الفاضي = صفر.</span>
          <span className="flex gap-3">
            <strong className="w-[52px] text-center">كيكات</strong>
            <strong className="w-[52px] text-center">قطع</strong>
          </span>
        </div>
        <ol className="flex flex-col">
          {form.rows.map((r) => (
            <li
              key={r.n}
              className="flex items-center gap-3 border-b border-print-rule"
              style={{ height: rowHeight }}
            >
              <span className="w-6 text-[13px] text-print-text">{r.n}</span>
              <span dir="ltr" className="grow text-right text-base font-semibold">
                {r.nameEn}
              </span>
              <span className="w-[140px] text-[13px] text-print-muted">{r.nameAr ?? ""}</span>
              {r.piecesOnly ? (
                <span className="flex h-[30px] w-[52px] items-center justify-center border border-dashed border-print-rule bg-print-fill text-print-muted">
                  —
                </span>
              ) : (
                <span className="h-[30px] w-[52px] border-[2.5px] border-black" />
              )}
              <span className="h-[30px] w-[52px] border-[2.5px] border-black" />
            </li>
          ))}
        </ol>
        <div className="grow" />
        <footer className="flex gap-10 border-t-2 border-black pt-3.5 text-[15px]">
          <span>اسم الموظف: ______________________</span>
          <span>التوقيع: ______________</span>
        </footer>
      </article>
    </div>
  );
}
