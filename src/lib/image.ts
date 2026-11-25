// الصور بتنضغط بالجوال قبل الرفع: صورة الكاميرا 4–8MB. الرفع على نت الفروع بطيء، فالحجم صغير قد ما بنقدر
// والأرقام بتضل واضحة (25 نوفمبر: كانت 2000px و85%، تقريباً 1MB).
// - صورة فورم الجرد (Claude بيقرأ أرقام مكتوبة بخط اليد): 1800px و78%، تقريباً 300–450KB.
// - باقي الصور (التالف، الفاتورة، المهام): 1600px و72%، تقريباً 200–350KB، ونص الفاتورة بيضل مقروء.

export const MAX_PHOTO_SIDE = 1600;
export const PHOTO_QUALITY = 0.72;
export const FORM_PHOTO_SIDE = 1800;
export const FORM_PHOTO_QUALITY = 0.78;

/** المقاس الجديد مع الحفاظ على النسبة. ما بنكبّر صورة صغيرة. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(
  file: Blob,
  maxSide = MAX_PHOTO_SIDE,
  quality = PHOTO_QUALITY,
): Promise<Blob> {
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
