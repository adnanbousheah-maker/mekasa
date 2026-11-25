"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { rememberPage } from "@/features/search/recent";
import { navCountsAction } from "../nav-actions";
import { NAV_PAGES, NavItemList, type NavAccess, type NavCounts } from "./NavItemList";

// الأعداد بتنحسب من كل بيانات النظرة العامة، فما بنطلبها مع كل تنقّل: آخر نتيجة بتضل دقيقة
// (والصفحة بتبين فوراً بالأعداد القديمة). docs/perf-2026-11.md
const COUNTS_MAX_AGE_MS = 60_000;
let lastCounts: { at: number; counts: NavCounts } | null = null;

/** المسار الحالي، والأعداد بتوصل بعد ما الصفحة تبين (مرة بالدقيقة على الأكثر). */
export function ActiveNavItems({ access }: { access: NavAccess }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>(() => lastCounts?.counts ?? {});
  // آخر الصفحات (للبحث العام)
  useEffect(() => {
    const page = [...NAV_PAGES]
      .sort((a, b) => b.href.length - a.href.length)
      .find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
    if (page) rememberPage({ href: page.href, label: page.label });
  }, [pathname]);
  useEffect(() => {
    if (lastCounts && Date.now() - lastCounts.at < COUNTS_MAX_AGE_MS) return;
    let live = true;
    navCountsAction()
      .then((c) => {
        lastCounts = { at: Date.now(), counts: c };
        if (live) setCounts(c);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);
  return <NavItemList pathname={pathname} counts={counts} access={access} />;
}
