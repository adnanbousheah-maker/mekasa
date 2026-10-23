// قفل الحساب (CLAUDE.md): 5 غلط ← 15 دقيقة، 10 غلط ← لحد ما الأدمن يعطي رمز جديد، وحد لكل IP.
// التنفيذ بقاعدة البيانات (auth_reserve_login_attempt) مشان الطلبات المتزامنة ما تتخطاه.
// هالأرقام لازم تطابق اللي هناك.

export const LOCKOUT = {
  timedLockAfter: 5,
  timedLockMinutes: 15,
  adminResetAfter: 10,
  ipFailureLimit: 20,
  ipWindowMinutes: 15,
} as const;

/**
 * نفس الرسالة لكل فشل (رقم مش موجود، رمز غلط، حساب مقفول أو موقوف)، مشان ما حدا يعرف
 * من الرسالة إذا الرقم مسجل عنا.
 */
export const LOGIN_FAILED_MESSAGE =
  `رقم الجوال أو الرمز غلط. بعد ${LOCKOUT.timedLockAfter} محاولات غلط الحساب بينقفل ` +
  `${LOCKOUT.timedLockMinutes} دقيقة، وإذا ضل مقفول احكي مع المدير.`;

/** كل رد فاشل بياخذ هالوقت على الأقل، مشان سرعة الرد ما تكشف إذا الرقم موجود. */
export const MIN_FAILURE_RESPONSE_MS = 700;

export async function waitUntilElapsed(startedAt: number, minimumMs: number, now = Date.now): Promise<void> {
  const remaining = startedAt + minimumMs - now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
