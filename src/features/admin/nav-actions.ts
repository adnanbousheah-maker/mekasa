"use server";

import { canReadAll, getCurrentStaff } from "@/features/auth/session";
import { unreadCount } from "@/features/notifications/queries";
import { attention } from "./attention";

/** أعداد القائمة الجانبية. بتنطلب من المتصفح بعد ما الصفحة تبين، مشان ما تبطّئ الحفظ. */
export async function navCountsAction(): Promise<Record<string, number>> {
  const staff = await getCurrentStaff();
  if (!staff || !canReadAll(staff)) return {};
  const [{ counts, urgent }, unread] = await Promise.all([attention(), unreadCount()]);
  return { ...counts, urgent, unread };
}
