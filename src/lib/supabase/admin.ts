import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import type { Database } from "@/types/database";

/**
 * عميل service role: بيتخطى RLS. بس للشغلات اللي ما إلها بديل بجلسة المستخدم:
 * حسابات الدخول (إنشاء، رمز جديد، حظر)، عدادات القفل، والـ cron.
 * قبل أي استعمال، المنادي لازم يكون تأكد من صلاحية المستخدم بنفسه.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
