export const PHOTO_BUCKETS = ["count-photos", "waste-photos", "invoices"] as const;
export type PhotoBucket = (typeof PHOTO_BUCKETS)[number];

export const PHOTO_MAX_BYTES = 3.5 * 1024 * 1024;

export const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
