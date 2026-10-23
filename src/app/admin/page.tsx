import Link from "next/link";

// design/admin/AdminOverview.dc.html بتنبني بالخطوة 10 (بتحتاج الجرد والتالف).
export default function AdminOverviewPage() {
  return (
    <>
      <h1 className="text-[26px] font-bold">نظرة عامة</h1>
      <p className="rounded-2xl border border-line bg-surface p-5 text-base text-muted">
        النظرة العامة (المواقع، التنبيهات، الاستهلاك) بتنبني بالخطوة 10، بعد ما يصير في جرد وتالف. هلأ بتقدر
        تضيف{" "}
        <Link href="/admin/staff" className="font-semibold text-ink underline underline-offset-4">
          الموظفين والأدوار
        </Link>
        .
      </p>
    </>
  );
}
