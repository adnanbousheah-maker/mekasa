"use client";

import { usePathname } from "next/navigation";
import { NavItemList } from "./NavItemList";

/** المسار الحالي بيوصل وقت الطلب، فهالجزء بس بيستنى (جوا Suspense). */
export function ActiveNavItems() {
  return <NavItemList pathname={usePathname()} />;
}
