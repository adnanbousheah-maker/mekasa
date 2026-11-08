"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navCountsAction } from "../nav-actions";
import { NavItemList, type NavCounts } from "./NavItemList";

/** المسار الحالي، والأعداد بتوصل بعد ما الصفحة تبين (مع كل تنقل). */
export function ActiveNavItems({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>({});
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
