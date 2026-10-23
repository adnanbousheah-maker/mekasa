import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffScreen } from "@/components/ui/StaffScreen";
import { formatScheduleTime } from "@/features/settings/schemas";

export function countTitle(timeOfDay: string): string {
  return `جرد الساعة ${formatScheduleTime(timeOfDay)}`;
}

/** لموظف ما إله جرد (مثلاً الإخراج بس). */
export function NotCounting() {
  return (
    <StaffScreen>
      <ScreenHeader title="الجرد" />
      <p className="rounded-2xl border border-line bg-surface p-5 text-base text-muted">
        الجرد لموظفين الفرع وأمين المستودع. إذا لازم تجرد، احكي مع المدير.
      </p>
    </StaffScreen>
  );
}
