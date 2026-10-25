// طول الرمز. ملف لحاله بدون أي استيراد، مشان شاشة الدخول (عند المتصفح) تقدر تستعمله.

export type PinRole = "admin" | "branch_staff" | "dispatcher" | "storekeeper" | "packaging_keeper";

export const STAFF_PIN_LENGTH = 4;
// كان 6 للأدمن؛ صاحب المشروع طلب 4 للكل (24 أكتوبر 2026). القفل وحد الـ IP بيحموه.
export const ADMIN_PIN_LENGTH = 4;

/** طول رمز الموظف حسب أدواره (هلا 4 للكل). */
export function pinLengthFor(roles: readonly PinRole[]): number {
  return roles.includes("admin") ? ADMIN_PIN_LENGTH : STAFF_PIN_LENGTH;
}
