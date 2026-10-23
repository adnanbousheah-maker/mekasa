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
