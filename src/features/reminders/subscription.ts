import { z } from "zod";

// نفس شرط قاعدة البيانات: خدمات الإشعارات المعروفة بس (مشان ما حدا يستعمل السيرفر ليوصل لعناوين داخلية)
export const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)\//;

export const subscriptionSchema = z.object({
  endpoint: z.string().max(1024).regex(PUSH_ENDPOINT),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export type PushSubscriptionJson = z.infer<typeof subscriptionSchema>;

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** جرد آخر الشهر: تذكير قبل الموعد، و"متأخر" بعده. */
export function monthlyCountMessage(
  late: boolean,
  scope: "stock" | "raw",
  time: string,
  place: string,
  locationKind: string,
  locationId: string,
): PushMessage {
  const what = scope === "raw" ? "المواد الأولية" : locationKind === "packaging" ? "مواد التغليف" : "الكيك";
  const url =
    scope === "raw" ? "/factory/raw/count" : locationKind === "packaging" ? "/packaging/count" : "/count";
  return late
    ? {
        title: "جرد آخر الشهر متأخر",
        body: `${place}: جرد ${what} لآخر الشهر (الساعة ${time}) لسا ما انعمل.`,
        url,
        tag: `monthly-${scope}-${locationId}`,
      }
    : {
        title: "اليوم جرد آخر الشهر",
        body: `${place}: الساعة ${time} عدّ كل ${what}.`,
        url,
        tag: `monthly-${scope}-${locationId}`,
      };
}

export function countReminderMessage(
  kind: "count_reminder" | "count_late",
  time: string,
  place: string,
): PushMessage {
  return kind === "count_reminder"
    ? {
        title: `جرد الساعة ${time}`,
        body: `وقت جرد ${place} قرّب. افتح التطبيق وابدأ.`,
        url: "/count",
        tag: `count-${time}-${place}`,
      }
    : {
        title: `جرد الساعة ${time} متأخر`,
        body: `جرد ${place} لسا ما انعمل.`,
        url: "/count",
        tag: `count-${time}-${place}`,
      };
}
