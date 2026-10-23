import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import Link from "next/link";
import { getCurrentStaff } from "@/features/auth/session";
import { maskPhone } from "@/features/auth/phone";
import { StaffRowActions } from "@/features/staff/components/StaffRowActions";
import { listStaff } from "@/features/staff/queries";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/features/staff/roles";
import { formatLastSeen } from "@/lib/time";

// design/admin/AdminStaff.dc.html
async function Staff() {
  const [staff, me] = await Promise.all([listStaff(), getCurrentStaff()]);
  const now = new Date();
  const activeCount = (role: (typeof ROLES)[number]) =>
    staff.filter((s) => s.isActive && s.roles.includes(role)).length;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold">الموظفين والأدوار</h1>
          <span className="text-sm text-muted">
            الموظف ممكن ياخذ أكثر من دور، والدور ممكن يكون عند أكثر من موظف
          </span>
        </div>
        <Link
          href="/admin/staff/new"
          className="inline-flex h-11 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
        >
          + موظف جديد
        </Link>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <section className="min-w-0 flex-[999_1_560px] overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="bg-table-head text-table-head-text">
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  الموظف
                </th>
                <th scope="col" className="px-2 py-3 text-right font-semibold">
                  الموقع
                </th>
                <th scope="col" className="px-2 py-3 text-right font-semibold">
                  الأدوار
                </th>
                <th scope="col" className="px-2 py-3 text-right font-semibold">
                  آخر دخول
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  الحالة
                </th>
                <th scope="col" className="px-2 py-3">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    ما في موظفين لسا.
                  </td>
                </tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className={`border-t border-line-soft ${s.isActive ? "" : "opacity-60"}`}>
                  <th scope="row" className="px-4 py-3 text-right font-semibold">
                    <span className="block">{s.fullName}</span>
                    <span dir="ltr" className="block text-right text-xs font-normal text-muted">
                      {maskPhone(s.phone)}
                    </span>
                  </th>
                  <td className="px-2 py-3">{s.location?.name ?? "كل المواقع"}</td>
                  <td className="px-2 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      {s.roles.map((r) => (
                        <span key={r} className="rounded-[10px] bg-quiet px-2.5 py-0.5 text-xs">
                          {ROLE_LABELS[r]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-muted">
                    {formatLastSeen(s.lastLoginAt ? new Date(s.lastLoginAt) : null, now)}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <StatusChip isActive={s.isActive} isLocked={s.isLocked} />
                  </td>
                  <td className="px-2 py-2 text-left">
                    <StaffRowActions
                      staffId={s.id}
                      fullName={s.fullName}
                      isActive={s.isActive}
                      isSelf={s.id === me?.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="flex max-w-[340px] flex-[1_1_280px] flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-[17px] font-bold">الأدوار</h2>
          {ROLES.map((role) => (
            <div key={role} className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">
                {ROLE_LABELS[role]} · {activeCount(role)}
              </span>
              <span className="text-[13px] text-muted">{ROLE_DESCRIPTIONS[role]}</span>
            </div>
          ))}
          <span className="text-[13px] leading-relaxed text-info-text">
            إيقاف الموظف بيطلّعه من كل الأجهزة فوراً، وكل حركاته القديمة بتضل باسمه.
          </span>
        </section>
      </div>
    </>
  );
}

function StatusChip({ isActive, isLocked }: { isActive: boolean; isLocked: boolean }) {
  const [label, tone] = !isActive
    ? ["موقوف", "bg-quiet-strong text-table-head-text"]
    : isLocked
      ? ["مقفول", "bg-warn-chip text-warn-text"]
      : ["نشط", "bg-ok-soft text-ok-text"];
  return <span className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

export default function StaffPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Staff />
    </Suspense>
  );
}
