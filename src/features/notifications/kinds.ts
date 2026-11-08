// أسماء أنواع الإشعارات للفلتر. النوع من الـ tag (أول كلمة قبل -).
export const KIND_LABELS: Record<string, string> = {
  count: "الجرد",
  monthly: "جرد آخر الشهر",
  below: "الحد الأدنى",
  dispatch: "الإخراج",
  missing: "أصناف منسية",
  account_locked: "حسابات مقفولة",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "تنبيهات";
}
