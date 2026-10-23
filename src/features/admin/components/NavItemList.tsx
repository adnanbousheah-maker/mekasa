import Link from "next/link";

// design/admin/AdminNav.dc.html. الصفحات اللي لسا ما انبنت بتبين "قريباً" بدون رابط.
const ITEMS: { href: string; label: string; icon: string; ready: boolean }[] = [
  {
    href: "/admin",
    label: "نظرة عامة",
    icon: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
    ready: true,
  },
  {
    href: "/admin/stock",
    label: "الستوك والاستهلاك",
    icon: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4",
    ready: true,
  },
  {
    href: "/admin/orders",
    label: "الطلب والإخراج",
    icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18a2 2 0 1 0 0 .01M17 18a2 2 0 1 0 0 .01",
    ready: true,
  },
  { href: "/admin/counts", label: "الجرودات", icon: "M6 4h12v17H6zM9 9h6M9 13h6M9 17h3", ready: true },
  { href: "/admin/factory", label: "المصنع والدفعات", icon: "M3 21V9l6 4V9l6 4V5h6v16z", ready: true },
  { href: "/admin/raw", label: "المواد الأولية", icon: "M6 8h12l-1 12H7zM9 8V5h6v3", ready: true },
  {
    href: "/admin/waste",
    label: "التالف",
    icon: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    ready: true,
  },
  {
    href: "/admin/staff",
    label: "الموظفين والأدوار",
    icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-3-4.6",
    ready: true,
  },
  {
    href: "/admin/settings",
    label: "الإعدادات",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7",
    ready: true,
  },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

const BASE = "flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-[15px]";

/** الروابط. بدون pathname (null) بتطلع بدون تمييز، وبتنعرض هيك لحد ما المسار يوصل. */
export function NavItemList({ pathname }: { pathname: string | null }) {
  return ITEMS.map((item) => {
    const active = pathname !== null && isActive(pathname, item.href);
    return item.ready ? (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`${BASE} ${active ? "bg-quiet font-semibold text-ink" : "text-table-head-text hover:bg-quiet"}`}
      >
        <NavIcon d={item.icon} />
        <span className="grow">{item.label}</span>
      </Link>
    ) : (
      <span key={item.href} className={`${BASE} text-line-strong`} title="بتنبني بالخطوات الجاية">
        <NavIcon d={item.icon} />
        <span className="grow">{item.label}</span>
        <span className="text-xs">قريباً</span>
      </span>
    );
  });
}
