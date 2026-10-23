import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";
import type { Database } from "@/types/database";

/**
 * عميل Supabase بجلسة المستخدم (RLS شغال). لازم ينعمل جديد لكل طلب.
 * من Server Components ما بنقدر نكتب كوكيز، فتجديد الجلسة بيصير بـ proxy.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component: الكوكيز للقراءة بس هون، وproxy.ts بيجدد الجلسة بكل طلب.
        }
      },
    },
  });
}
