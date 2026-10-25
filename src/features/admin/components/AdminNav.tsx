import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { ActiveNavItems } from "./ActiveNavItems";
import { NavItemList } from "./NavItemList";

// design/admin/AdminNav.dc.html. بالجوال: سطر فوق (اللوجو والمساعد والخروج) وسطر روابط بيتمرر،
// مشان الصفحة تبين على طول. باللابتوب: قائمة جنب الصفحة.
export function AdminNav({ footer }: { footer: ReactNode }) {
  return (
    <nav
      aria-label="القائمة الرئيسية"
      className="flex w-full flex-col gap-1 border-b border-line bg-surface px-4 py-3 lg:min-h-dvh lg:border-b-0 lg:border-l lg:py-6"
    >
      <div className="flex items-center justify-between gap-2 px-2 pb-2 lg:flex-col lg:items-start lg:gap-0.5 lg:pb-5">
        <Logo />
        <span className="hidden text-xs tracking-wide text-muted lg:inline">لوحة الإدارة</span>
        <div className="flex items-center gap-2 lg:hidden">
          <Link
            href="/admin/ai"
            className="flex h-10 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-semibold text-white"
          >
            <span aria-hidden="true">✦</span>
            المساعد
          </Link>
          <LogoutButton className="px-1 text-sm" />
        </div>
      </div>

      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        <Suspense fallback={<NavItemList pathname={null} />}>
          <ActiveNavItems />
        </Suspense>
      </div>

      <div className="hidden min-h-6 grow lg:block" />
      <Link
        href="/admin/ai"
        className="hidden h-12 items-center gap-2.5 rounded-xl bg-ink px-3.5 text-[15px] font-semibold text-white lg:flex"
      >
        <span aria-hidden="true">✦</span>
        اسأل المساعد
      </Link>
      <div className="hidden lg:block">{footer}</div>
    </nav>
  );
}
