// رمز الدخول وكلمة السر المشتقة منه (CLAUDE.md: الدخول).
// هالملف ما بيستورد إشي غير node:crypto، مشان سكربت الـ seed يقدر يستعمله كمان.
// المفتاح السري (pepper) بيجي كوسيط، وما بيطلع من السيرفر.

import { createHmac, randomInt } from "node:crypto";

export { ADMIN_PIN_LENGTH, pinLengthFor, STAFF_PIN_LENGTH, type PinRole } from "./pin-length.ts";

const MIN_PEPPER_LENGTH = 40;

/** رموز سهلة التخمين: نفس الرقم، تسلسل طالع أو نازل، أو رقمين بيتكرروا (1212). */
export function isWeakPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);

  const allSame = steps.every((s) => s === 0);
  const ascending = steps.every((s) => s === 1);
  const descending = steps.every((s) => s === -1);
  const alternating = digits.every((d, i) => d === digits[i % 2]);

  return allSame || ascending || descending || alternating;
}

/** رمز عشوائي (crypto) مش سهل. بيبين للأدمن مرة وحدة وما بينحفظ. */
export function generatePin(length: number): string {
  for (;;) {
    const pin = Array.from({ length }, () => randomInt(10)).join("");
    if (!isWeakPin(pin)) return pin;
  }
}

/**
 * كلمة السر الحقيقية بـ Supabase Auth = HMAC-SHA256(pepper, staffId:pin) بـ base64url (43 حرف).
 * بدون الـ pepper ما حدا بيقدر يجرب رموز مباشرة على Supabase ويتخطى القفل تبعنا.
 */
export function derivePassword(pepper: string, staffId: string, pin: string): string {
  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error("AUTH_PIN_PEPPER is too short");
  }
  return createHmac("sha256", pepper).update(`${staffId}:${pin}`).digest("base64url");
}

/** إيميل الدخول من رقم الموظف (ثابت حتى لو تغير الجوال). ما بينبعتله إشي أبداً. */
export function authEmailFor(staffId: string): string {
  return `${staffId}@staff.mekasa.local`;
}
