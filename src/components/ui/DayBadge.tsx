import { DAY_COLORS, DAY_NAMES, type DayNumber } from "@/lib/day-number";

type Props = {
  day: DayNumber;
  size?: "sm" | "md";
};

const SIZES = {
  sm: "min-w-[22px] h-[22px] text-xs",
  md: "min-w-8 h-8 text-[15px]",
} as const;

/** دائرة رقم اليوم بلونه الثابت. */
export function DayBadge({ day, size = "md" }: Props) {
  return (
    <span
      aria-label={`رقم ${day}، ${DAY_NAMES[day]}`}
      className={`inline-flex items-center justify-center rounded-full px-1.5 font-bold text-white ${SIZES[size]}`}
      style={{ backgroundColor: DAY_COLORS[day] }}
    >
      {day}
    </span>
  );
}
