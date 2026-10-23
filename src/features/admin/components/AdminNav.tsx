import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { ActiveNavItems } from "./ActiveNavItems";
import { NavItemList } from "./NavItemList";

// design/admin/AdminNav.dc.html
export function AdminNav({ footer }: { footer: ReactNode }) {
  return (
    <nav
      aria-label="القائمة الرئيسية"
      className="flex w-full flex-col gap-1 border-line bg-surface px-4 py-6 lg:min-h-dvh lg:border-l"
    >
      <div className="flex flex-col items-start gap-0.5 px-2 pb-5">
        <Logo />
        <span className="text-xs tracking-wide text-muted">لوحة الإدارة</span>
      </div>

      <Suspense fallback={<NavItemList pathname={null} />}>
        <ActiveNavItems />
      </Suspense>

      <div className="min-h-6 grow" />
      <Link
        href="/admin/ai"
        className="flex h-12 items-center gap-2.5 rounded-xl bg-ink px-3.5 text-[15px] font-semibold text-white"
      >
        <span aria-hidden="true">✦</span>
        اسأل المساعد
      </Link>
      {footer}
    </nav>
  );
}
