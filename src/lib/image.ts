// الصور بتنضغط بالجوال قبل الرفع: صورة الكاميرا 4–8MB، وبعد الضغط أقل من 1MB،
// وبتضل الأرقام واضحة لقراءة الفورم.

export const MAX_PHOTO_SIDE = 2000;

/** المقاس الجديد مع الحفاظ على النسبة. ما بنكبّر صورة صغيرة. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(file: Blob, maxSide = MAX_PHOTO_SIDE, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the photo"))),
      "image/jpeg",
      quality,
    ),
  );
}
