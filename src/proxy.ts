import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { canonicalRedirect } from "@/lib/canonical-host";

export async function proxy(request: NextRequest) {
  // الرابط القديم بيحوّل على الدومين الرسمي (نفس الصفحة)
  const target = canonicalRedirect(
    request.headers.get("host"),
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (target) return NextResponse.redirect(target, 308);
  return updateSession(request);
}

export const config = {
  // كل شي إلا ملفات Next الثابتة والصور واللوجو
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
