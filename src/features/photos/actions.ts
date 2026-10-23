"use server";

import { randomUUID } from "node:crypto";
import { requireStaff } from "@/features/auth/session";
import { businessDate } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKETS, PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoBucket } from "./rules";

export type UploadResult = { status: "error"; message: string } | { status: "done"; path: string };

/**
 * رفع صورة لمجلد موقع الموظف ({location_id}/{date}/{uuid}.jpg) بجلسته، فسياسة التخزين
 * بتتأكد من المجلد كمان. الأدمن ما إله موقع، فبيمرر الموقع ونفس السياسة بتفحصه.
 */
export async function uploadPhotoAction(bucket: PhotoBucket, formData: FormData): Promise<UploadResult> {
  const staff = await requireStaff();
  if (!PHOTO_BUCKETS.includes(bucket)) return { status: "error", message: "مكان الصورة مش صحيح" };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "ما في صورة" };
  if (file.size > PHOTO_MAX_BYTES) return { status: "error", message: "الصورة كبيرة كثير" };
  const extension = PHOTO_TYPES[file.type as keyof typeof PHOTO_TYPES];
  if (!extension) return { status: "error", message: "نوع الملف مش صورة" };

  const requested = formData.get("locationId");
  const locationId = staff.location?.id ?? (typeof requested === "string" ? requested : null);
  if (!locationId) return { status: "error", message: "حسابك مش مربوط بموقع" };

  const path = `${locationId}/${businessDate(new Date())}/${randomUUID()}.${extension}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  if (error) {
    console.error("uploadPhoto", error);
    return { status: "error", message: "ما انرفعت الصورة. جرب كمان مرة." };
  }
  return { status: "done", path };
}
