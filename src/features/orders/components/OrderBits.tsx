import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffScreen } from "@/components/ui/StaffScreen";
import { DAY_NAMES, dayNumberOf } from "@/lib/day-number";
import { businessDate } from "@/lib/time";

export const REQUEST_STATUS_LABELS = {
  pending_approval: "بانتظار الموافقة",
  sent: "مرسل",
  dispatched: "طلع من المصنع",
  received: "مستلم",
  cancelled: "ملغي",
} as const;

export const STATUS_TONES = {
  pending_approval: "bg-warn-chip text-warn-text",
  sent: "bg-quiet-strong text-table-head-text",
  dispatched: "bg-info-soft text-info-text",
  in_transit: "bg-info-soft text-info-text",
  received: "bg-ok-soft text-ok-text",
  cancelled: "bg-quiet text-muted",
  late: "bg-danger-soft text-danger-text",
} as const;

/** "اليوم" أو اسم اليوم ("الأربعاء"). */
export function dayLabel(at: string, now: Date): string {
  const date = businessDate(new Date(at));
  if (date === businessDate(now)) return "اليوم";
  return DAY_NAMES[dayNumberOf(date)];
}

export function NotForYou({ title, text }: { title: string; text: string }) {
  return (
    <StaffScreen>
      <ScreenHeader title={title} />
      <p className="rounded-2xl border border-line bg-surface p-5 text-base text-muted">{text}</p>
    </StaffScreen>
  );
}
