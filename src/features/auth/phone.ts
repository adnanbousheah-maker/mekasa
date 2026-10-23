// أرقام الجوال الأردنية. بنخزنها E.164 بدون + (9627XXXXXXXX) وبنعرضها بالشكل المحلي.

const JORDAN_MOBILE = /^9627[789]\d{7}$/;

// الأرقام العربية الهندية (٠-٩) والفارسية (۰-۹) لأرقام لاتينية
function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

/** بيقبل 079…، +962…، 00962…، 962… أو 79… وبيرجع 9627XXXXXXXX، أو null إذا مش رقم جوال أردني. */
export function normalizePhone(input: string): string | null {
  let digits = toLatinDigits(input).replace(/[\s\-().+]/g, "");
  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith("00962")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `962${digits.slice(1)}`;
  else if (digits.startsWith("7")) digits = `962${digits}`;

  return JORDAN_MOBILE.test(digits) ? digits : null;
}

/** "079 123 4567" */
export function formatPhone(e164: string): string {
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** "079 ••• 4567" متل جدول الموظفين بالتصميم */
export function maskPhone(e164: string): string {
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 3)} ••• ${local.slice(6)}`;
}
