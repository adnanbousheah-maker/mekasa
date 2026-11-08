// قفل الحساب (CLAUDE.md): كل 5 غلط قفل أطول (15 دقيقة، ساعة، يوم) وإشعار للأدمن من الثاني، وحد لكل IP.
// ما في قفل دائم: حدا بيعرف رقم موظف ما بيقدر يقفله للأبد.
// التنفيذ بقاعدة البيانات (auth_reserve_login_attempt) مشان الطلبات المتزامنة ما تتخطاه.
// هالأرقام لازم تطابق اللي هناك.

export const LOCKOUT = {
  timedLockAfter: 5,
  timedLockMinutes: 15,
  ipFailureLimit: 20,
  ipWindowMinutes: 15,
} as const;

/**
 * نفس الرسالة لكل فشل (رقم مش موجود، رمز غلط، حساب مقفول أو موقوف)، مشان ما حدا يعرف
 * من الرسالة إذا الرقم مسجل عنا.
 */
export const LOGIN_FAILED_MESSAGE =
  `الاسم أو الرقم أو الرمز غلط. بعد ${LOCKOUT.timedLockAfter} محاولات غلط الحساب بينقفل ` +
  `${LOCKOUT.timedLockMinutes} دقيقة (وبعدها أطول). إذا نسيت الرمز احكي مع المدير.`;

/** كل رد فاشل بياخذ هالوقت على الأقل، مشان سرعة الرد ما تكشف إذا الرقم موجود. */
export const MIN_FAILURE_RESPONSE_MS = 1500;

export async function waitUntilElapsed(startedAt: number, minimumMs: number, now = Date.now): Promise<void> {
  const remaining = startedAt + minimumMs - now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
