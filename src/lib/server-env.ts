import "server-only";
import { z } from "zod";

// مفاتيح السيرفر بس. هالملف ما بينفع ينستورد من مكون عند المتصفح (server-only بيمنعه).
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  // 32 بايت عشوائي على الأقل (base64 = 44 حرف)
  AUTH_PIN_PEPPER: z.string().min(40),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AUTH_PIN_PEPPER: process.env.AUTH_PIN_PEPPER,
  });
  return cached;
}

const pushSchema = z.object({
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(40),
  VAPID_PRIVATE_KEY: z.string().min(20),
});

/** مفاتيح Web Push. null إذا مش مضبوطة (الإشعارات بتتعطل بس، والباقي شغال). */
export function pushEnv(): z.infer<typeof pushSchema> | null {
  const parsed = pushSchema.safeParse({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

/** سر الـ cron. null = الـ cron مسكّر. */
export function cronSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}
