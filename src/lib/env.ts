import { z } from "zod";

// المتغيرات اللي بتبلش بـ NEXT_PUBLIC_ بتنحط بالـ bundle وقت البناء، فلازم تنقرأ بالاسم الحرفي.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | undefined;

/** بيفشل بوضوح إذا متغير ناقص، بدل ما يفشل بعدين بمكان مش مفهوم. */
export function publicEnv(): PublicEnv {
  cached ??= publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return cached;
}
