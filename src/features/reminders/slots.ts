// حالة مواعيد الجرد اليوم، ومين لازم ياخذ إشعار. نفس منطق v_count_slots_today بقاعدة البيانات،
// بس هون للـ cron اللي بيشتغل بـ service role (ما إله موقع، فالـ view ما بترجعله شي).

export type SlotStatus = "done" | "late" | "due" | "upcoming";

export interface Schedule {
  id: string;
  locationId: string;
  // "09:00:00" بتوقيت عمّان
  timeOfDay: string;
}

export interface ReminderSettings {
  reminderMinutesBefore: number;
  lateAfterMinutes: number;
}

const MINUTE = 60_000;

/** وقت الموعد اليوم (بعمّان) كـ Date. عمّان +03:00 طول السنة. */
export function slotTime(todayIso: string, timeOfDay: string): Date {
  return new Date(`${todayIso}T${timeOfDay.slice(0, 5)}:00+03:00`);
}

export function slotStatus(slotAt: Date, now: Date, done: boolean, settings: ReminderSettings): SlotStatus {
  if (done) return "done";
  if (now.getTime() >= slotAt.getTime() + settings.lateAfterMinutes * MINUTE) return "late";
  if (now.getTime() >= slotAt.getTime() - settings.reminderMinutesBefore * MINUTE) return "due";
  return "upcoming";
}

/** "متأخر 15 دقيقة" / "متأخر ساعة و10 دقايق". */
export function lateLabel(slotAt: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - slotAt.getTime()) / MINUTE));
  if (minutes < 60) return `متأخر ${minutes} ${minutes >= 3 && minutes <= 10 ? "دقايق" : "دقيقة"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? "ساعة" : hours === 2 ? "ساعتين" : `${hours} ساعات`;
  return rest === 0 ? `متأخر ${h}` : `متأخر ${h} و${rest} دقيقة`;
}

export type PendingAlert = { kind: "count_reminder" | "count_late"; schedule: Schedule; slotAt: Date };

/**
 * الإشعارات اللي لازم تنبعت هلا: تذكير لما الموعد يصير "due"، و"متأخر" لما يصير "late".
 * اللي انبعت قبل (sent) ما بيتكرر. الـ cron بيشتغل كل دقيقة، فبنتجاهل الأقدم من ساعتين.
 */
export function pendingAlerts(
  schedules: Schedule[],
  todayIso: string,
  now: Date,
  doneScheduleIds: ReadonlySet<string>,
  sent: ReadonlySet<string>,
  settings: ReminderSettings,
): PendingAlert[] {
  const alerts: PendingAlert[] = [];
  for (const schedule of schedules) {
    const slotAt = slotTime(todayIso, schedule.timeOfDay);
    const status = slotStatus(slotAt, now, doneScheduleIds.has(schedule.id), settings);
    if (now.getTime() - slotAt.getTime() > 2 * 60 * MINUTE) continue;
    if (status === "due" && !sent.has(`count_reminder:${schedule.id}`)) {
      alerts.push({ kind: "count_reminder", schedule, slotAt });
    }
    if (status === "late" && !sent.has(`count_late:${schedule.id}`)) {
      alerts.push({ kind: "count_late", schedule, slotAt });
    }
  }
  return alerts;
}
