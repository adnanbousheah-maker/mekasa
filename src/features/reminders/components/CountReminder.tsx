import Link from "next/link";
import { formatScheduleTime } from "@/features/settings/schemas";
import { lateLabel } from "../slots";
import type { OpenSlot } from "../queries";

/** design/branch/Main: تذكير الجرد البرتقالي بأعلى الرئيسية. */
export function CountReminder({ slot, now }: { slot: OpenSlot; now: Date }) {
  const time = formatScheduleTime(slot.timeOfDay);
  return (
    <section
      aria-label="تذكير الجرد"
      className="flex flex-col gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4"
    >
      <div className="flex items-center gap-3">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-warn"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <div className="flex flex-col">
          <strong className="text-[17px] text-warn-text">جرد الساعة {time} لسا ما انعمل</strong>
          <span className="text-sm text-warn-text">
            {slot.status === "late" ? lateLabel(new Date(slot.slotAt), now) : "وقته هلا"}
          </span>
        </div>
      </div>
      <Link
        href="/count"
        className="flex h-12 items-center justify-center rounded-xl bg-warn text-[17px] font-semibold text-white"
      >
        ابدأ الجرد الآن
      </Link>
    </section>
  );
}
