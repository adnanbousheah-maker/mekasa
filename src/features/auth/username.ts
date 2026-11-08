// اسم المستخدم: إنجليزي صغير وأرقام ونقطة وشحطة سفلية، 3 لـ 30، وبيبلش بحرف (نفس CHECK قاعدة البيانات).

const USERNAME = /^[a-z][a-z0-9._]{2,29}$/;

/** بيرجع الاسم بالحروف الصغيرة، أو null إذا مش صالح. */
export function normalizeUsername(input: string): string | null {
  const value = input.trim().toLowerCase();
  return USERNAME.test(value) ? value : null;
}

/** معرّف الدخول: رقم جوال (بيرجع 9627…) أو اسم مستخدم. */
export function loginIdentifier(input: string, normalizePhone: (v: string) => string | null): string | null {
  return normalizePhone(input) ?? normalizeUsername(input);
}
