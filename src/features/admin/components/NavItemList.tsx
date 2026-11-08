import Link from "next/link";

// design/admin/AdminNav.dc.html، مجمّعة (مراجعة 8 نوفمبر): كل قسم إله عنوان،
// وجنب كل قائمة عدد الأشياء اللي بدها تصرف. المدير العام ما بيشوف الإعدادات والموظفين.

export type NavCounts = Partial<Record<string, number>>;

type Item = { href: string; label: string; icon: string; badge?: string; adminOnly?: boolean };

const GROUPS: { title: string | null; items: Item[] }[] = [
  {
    title: null,
    items: [
      { href: "/admin", label: "نظرة عامة", icon: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" },
      {
        href: "/admin/attention",
        label: "لازم تتصرف",
        icon: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
        badge: "urgent",
      },
      {
        href: "/admin/notifications",
        label: "الإشعارات",
        icon: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0",
        badge: "unread",
      },
    ],
  },
  {
    title: "العمليات",
    items: [
      {
        href: "/admin/orders",
        label: "الطلب والإخراج",
        icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18a2 2 0 1 0 0 .01M17 18a2 2 0 1 0 0 .01",
        badge: "orders",
      },
      {
        href: "/admin/counts",
        label: "الجرودات",
        icon: "M6 4h12v17H6zM9 9h6M9 13h6M9 17h3",
        badge: "counts",
      },
      { href: "/admin/waste", label: "التالف", icon: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" },
      {
        href: "/admin/tasks",
        label: "المهام المتكررة",
        icon: "M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9",
        badge: "tasks",
      },
      {
        href: "/admin/factory",
        label: "المصنع والدفعات",
        icon: "M3 21V9l6 4V9l6 4V5h6v16z",
        badge: "factory",
      },
    ],
  },
  {
    title: "المخزون",
    items: [
      {
        href: "/admin/stock",
        label: "الستوك والاستهلاك",
        icon: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4",
        badge: "stock",
      },
      {
        href: "/admin/locations",
        label: "الفروع والمستودعات",
        icon: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
      },
      { href: "/admin/raw", label: "المواد الأولية", icon: "M6 8h12l-1 12H7zM9 8V5h6v3", badge: "raw" },
    ],
  },
  {
    title: "التقارير",
    items: [
      { href: "/admin/reports", label: "تقارير الإدارة", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
      { href: "/admin/audit", label: "سجل التعديلات", icon: "M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" },
    ],
  },
  {
    title: "الإدارة",
    items: [
      {
        href: "/admin/staff",
        label: "الموظفين والأدوار",
        icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-3-4.6",
        badge: "staff",
        adminOnly: true,
      },
      {
        href: "/admin/settings",
        label: "الإعدادات",
        icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7",
        adminOnly: true,
      },
    ],
  },
];

/** كل صفحات الإدارة (للبحث العام وآخر الصفحات). */
export const NAV_PAGES = GROUPS.flatMap((g) =>
  g.items.map((i) => ({
    href: i.href,
    label: i.label,
    group: g.title ?? "",
    adminOnly: Boolean(i.adminOnly),
  })),
);

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

// بالجوال سطر بيتمرر، وباللابتوب قائمة جنب الصفحة
const BASE =
  "flex h-11 shrink-0 items-center gap-2.5 rounded-[10px] border-s-[3px] px-3 text-[15px] whitespace-nowrap";

/** الروابط. بدون pathname (null) بتطلع بدون تمييز، وبتنعرض هيك لحد ما المسار يوصل. */
export function NavItemList({
  pathname,
  counts = {},
  isAdmin = true,
}: {
  pathname: string | null;
  counts?: NavCounts;
  isAdmin?: boolean;
}) {
  return GROUPS.map((group) => {
    const items = group.items.filter((i) => isAdmin || !i.adminOnly);
    if (items.length === 0) return null;
    return (
      <div key={group.title ?? "main"} className="contents lg:flex lg:flex-col lg:gap-1">
        {group.title && (
          <span className="hidden px-3 pt-3 pb-0.5 text-xs font-semibold tracking-wide text-muted lg:block">
            {group.title}
          </span>
        )}
        {items.map((item) => {
          const active = pathname !== null && isActive(pathname, item.href);
          const n = item.badge ? (counts[item.badge] ?? 0) : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={n > 0 ? `${item.label}: ${n}` : undefined}
              className={`${BASE} ${active ? "border-brand bg-quiet font-semibold text-ink" : "border-transparent text-table-head-text hover:bg-quiet"}`}
            >
              <NavIcon d={item.icon} />
              <span className="grow">{item.label}</span>
              {n > 0 && (
                <span
                  aria-hidden="true"
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${item.badge === "unread" ? "bg-info" : "bg-danger"}`}
                >
                  {n > 99 ? "99+" : n}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    );
  });
}
