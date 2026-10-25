import { batchLabel } from "@/lib/batch-label";
import { DayBadge } from "./DayBadge";

type Props = { productionDate: string; shelfLifeDays: number; size?: "sm" | "md" };

/** رقم اليوم بلونه، أو التاريخ للأصناف اللي بتعيش أكثر من أسبوع. */
export function BatchBadge({ productionDate, shelfLifeDays, size = "md" }: Props) {
  const label = batchLabel(productionDate, shelfLifeDays);
  if (label.kind === "day") return <DayBadge day={label.day} size={size} />;
  return (
    <span
      aria-label={`تاريخ ${label.text}`}
      className={`inline-flex items-center justify-center rounded-full border-2 border-ink px-2 font-bold tabular-nums ${size === "sm" ? "h-[22px] text-xs" : "h-8 text-[15px]"}`}
    >
      {label.text}
    </span>
  );
}
