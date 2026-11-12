// الدومين الرسمي للنظام. الرابط القديم (mekasa.vercel.app) بيحوّل عليه بنفس المسار.
// روابط النشر الثانية بـ Vercel (للمعاينة) ما بتتحوّل.
export const CANONICAL_HOST = "inv.mekasajo.com";
const OLD_HOSTS = new Set(["mekasa.vercel.app"]);

export function canonicalRedirect(host: string | null, pathname: string, search: string): string | null {
  if (!host || !OLD_HOSTS.has(host.toLowerCase())) return null;
  return `https://${CANONICAL_HOST}${pathname}${search}`;
}
