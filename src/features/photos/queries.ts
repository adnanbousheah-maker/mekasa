import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PhotoBucket } from "./rules";

/** رابط مؤقت (10 دقايق) لصورة خاصة. RLS على التخزين بتقرر مين بيشوف. */
export async function signedPhotoUrl(bucket: PhotoBucket, path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  if (error) {
    console.error("signedPhotoUrl", error);
    return null;
  }
  return data.signedUrl;
}
