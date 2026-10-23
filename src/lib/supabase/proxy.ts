import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";
import type { Database } from "@/types/database";

const PUBLIC_PATHS = ["/login"];

/**
 * بيجدد جلسة Supabase بكل طلب ويكتب الكوكيز الجديدة على الرد.
 * وبيعمل تحويل متفائل: اللي مش داخل بيروح على /login. الحماية الحقيقية بـ RLS
 * وبالتحقق على السيرفر بكل صفحة وعملية، مش هون.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // getClaims بيتحقق من التوقيع (مش بس بيقرأ الكوكي)، وبيجدد الجلسة إذا لازم
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!isSignedIn && !isPublic) {
    return redirectKeepingCookies(request, response, "/login");
  }
  if (isSignedIn && path === "/login") {
    return redirectKeepingCookies(request, response, "/");
  }
  return response;
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, to: string) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
