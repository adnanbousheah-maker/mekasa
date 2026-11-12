// الدومين الرسمي للنظام. الرابط القديم (mekasa.vercel.app) بيحوّل عليه بنفس المسار.
// روابط النشر الثانية بـ Vercel (للمعاينة) ما بتتحوّل.
export const CANONICAL_HOST = "inv.mekasajo.com";
// موقوف مؤقتاً (12 نوفمبر): كمبيوترات المكتب لسا ما بتفتح inv.mekasajo.com، فالرابط القديم احتياط.
// للتشغيل: رجّع "mekasa.vercel.app" للقائمة.
const OLD_HOSTS = new Set<string>([]);

export function canonicalRedirect(host: string | null, pathname: string, search: string): string | null {
  if (!host || !OLD_HOSTS.has(host.toLowerCase())) return null;
  return `https://${CANONICAL_HOST}${pathname}${search}`;
}
