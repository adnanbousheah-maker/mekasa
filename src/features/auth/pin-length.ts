// طول الرمز. ملف لحاله بدون أي استيراد، مشان شاشة الدخول (عند المتصفح) تقدر تستعمله.

export type PinRole = "admin" | "branch_staff" | "dispatcher" | "storekeeper";

export const STAFF_PIN_LENGTH = 4;
export const ADMIN_PIN_LENGTH = 6;

/** الأدمن بيقدر يعدل كل شي، فرمزه أطول. */
export function pinLengthFor(roles: readonly PinRole[]): number {
  return roles.includes("admin") ? ADMIN_PIN_LENGTH : STAFF_PIN_LENGTH;
}
