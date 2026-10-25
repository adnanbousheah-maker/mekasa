import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { getCurrentStaff, requireAdmin } from "@/features/auth/session";
import { AdminNav } from "@/features/admin/components/AdminNav";

export const metadata: Metadata = { title: "لوحة الإدارة · ميكاسا" };

// الصفحات كلها جوا AdminGate: غير الأدمن بيرجع للرئيسية قبل ما يشوف إشي.
// (كل عملية على السيرفر بتتأكد كمان لحالها، وRLS تحت الكل.)
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-wrap">
      <div className="flex w-full lg:w-60 lg:shrink-0 print:hidden">
        <AdminNav
          footer={
            <Suspense fallback={null}>
              <AdminUser />
            </Suspense>
          }
        />
      </div>
      <main className="flex max-w-[1200px] min-w-0 flex-[999_1_560px] flex-col gap-5 px-4 py-6 lg:px-8 lg:pt-8 lg:pb-12">
        <Suspense fallback={<span className="text-muted">لحظة…</span>}>
          <AdminGate>{children}</AdminGate>
        </Suspense>
      </main>
    </div>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}

async function AdminUser() {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  return (
    <div className="flex items-center gap-2.5 px-2 pt-3.5">
      <span className="flex size-9 items-center justify-center rounded-full bg-quiet font-bold">
        {staff.fullName.charAt(0)}
      </span>
      <div className="flex grow flex-col">
        <span className="text-sm font-semibold">{staff.fullName}</span>
        <span className="text-xs text-muted">المدير</span>
      </div>
      <LogoutButton className="px-0 text-sm" />
    </div>
  );
}
