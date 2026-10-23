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
        tag: `count-${time}`,
      }
    : {
        title: `جرد الساعة ${time} متأخر`,
        body: `جرد ${place} لسا ما انعمل.`,
        url: "/count",
        tag: `count-${time}`,
      };
}
