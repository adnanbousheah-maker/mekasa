import Link from "next/link";
import { unreadCount } from "../queries";

/** الجرس مع عدد غير المقروء. */
export async function NotificationBell({ href, className = "" }: { href: string; className?: string }) {
  const unread = await unreadCount();
  return (
    <Link
      href={href}
      aria-label={unread > 0 ? `الإشعارات، ${unread} غير مقروء` : "الإشعارات"}
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface ${className}`}
    >
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
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
