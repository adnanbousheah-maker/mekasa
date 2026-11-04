import Link from "next/link";
import { formatScheduleTime } from "@/features/settings/schemas";
import type { MonthlyCountDue } from "../queries";

function hrefOf(m: MonthlyCountDue): string {
  if (m.scope === "raw") return "/factory/raw/count";
  return m.locationKind === "packaging" ? "/packaging/count" : "/count";
}

function whatOf(m: MonthlyCountDue): string {
  if (m.scope === "raw") return "المواد الأولية";
  return m.locationKind === "packaging" ? "مواد التغليف" : "الكيك";
}

/** آخر يوم بالشهر: جرد شهري لكل شي، كل واحد بزر يفتحه. */
export function MonthlyCountBanner({ items }: { items: MonthlyCountDue[] }) {
  const open = items.filter((m) => !m.done);
  return (
    <section
      aria-label="جرد آخر الشهر"
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${open.length > 0 ? "border-warn-line bg-warn-soft" : "border-ok-soft bg-ok-soft"}`}
    >
      <div className="flex flex-col">
        <strong className={`text-[17px] ${open.length > 0 ? "text-warn-text" : "text-ok-text"}`}>
          {open.length > 0 ? "اليوم جرد آخر الشهر" : "✓ جرد آخر الشهر انعمل"}
        </strong>
        {open.length > 0 && (
          <span className="text-sm text-warn-text">عدّ كل شي، حتى اللي ما بتعدّه كل يوم.</span>
        )}
      </div>
      {open.map((m) => (
        <Link
          key={m.id}
          href={hrefOf(m)}
          className="flex h-12 items-center justify-center rounded-xl bg-warn px-3 text-center text-[16px] font-semibold text-white"
        >
          جرد {whatOf(m)} · الساعة {formatScheduleTime(m.timeOfDay)}
        </Link>
      ))}
    </section>
  );
}
