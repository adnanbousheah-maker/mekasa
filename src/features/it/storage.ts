import "server-only";
import { PHOTO_BUCKETS } from "@/features/photos/rules";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** كل الملفات تحت مجلد (المجلدات {موقع}/{تاريخ}/…). العناصر بدون id هي مجلدات. */
async function listFiles(db: Admin, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push(path);
      else files.push(...(await listFiles(db, bucket, path)));
    }
    if (data.length < 1000) return files;
  }
}

/** بيمسح كل صور الجرد والتالف والفواتير والمهام. بيرجع عدد الملفات اللي انمسحت. */
export async function deleteAllPhotos(): Promise<number> {
  const db = createAdminClient();
  let removed = 0;
  for (const bucket of PHOTO_BUCKETS) {
    const files = await listFiles(db, bucket, "");
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(files.slice(i, i + 100));
      if (error) throw new Error(`Could not delete from ${bucket}: ${error.message}`);
      removed += Math.min(100, files.length - i);
    }
  }
  return removed;
}
