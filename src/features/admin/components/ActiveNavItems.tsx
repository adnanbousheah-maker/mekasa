"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { rememberPage } from "@/features/search/recent";
import { navCountsAction } from "../nav-actions";
import { NAV_PAGES, NavItemList, type NavCounts } from "./NavItemList";

/** المسار الحالي، والأعداد بتوصل بعد ما الصفحة تبين (مع كل تنقل). */
export function ActiveNavItems({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>({});
  // آخر الصفحات (للبحث العام)
  useEffect(() => {
    const page = [...NAV_PAGES]
      .sort((a, b) => b.href.length - a.href.length)
      .find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
    if (page) rememberPage({ href: page.href, label: page.label });
  }, [pathname]);
  useEffect(() => {
    let live = true;
    navCountsAction()
      .then((c) => live && setCounts(c))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);
  return <NavItemList pathname={pathname} counts={counts} isAdmin={isAdmin} />;
}
