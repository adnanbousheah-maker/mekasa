import "server-only";
import webpush from "web-push";
import { pushEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PushMessage } from "./subscription";

/**
 * بيحفظ الإشعار بمركز الإشعارات لكل موظف (حتى لو ما عنده Push)، وبعدين بيبعته لكل أجهزتهم.
 * الاشتراكات الميتة (404/410) بتنحذف. بيرجع عدد الأجهزة اللي وصلها.
 */
export async function sendPushToStaff(staffIds: string[], message: PushMessage): Promise<number> {
  const ids = [...new Set(staffIds)];
  if (ids.length === 0) return 0;
  const db = createAdminClient();

  const { error: inboxError } = await db.from("notifications").insert(
    ids.map((staffId) => ({
      staff_id: staffId,
      kind: (message.tag ?? "alert").replace(/-.*$/, "").slice(0, 40) || "alert",
      title: message.title.slice(0, 120),
      body: message.body.slice(0, 500),
      // نفس CHECK قاعدة البيانات (`^/[^/]`): الرئيسية "/" لحالها بتنحفظ بدون رابط، وإلا الحفظ كله بيفشل
      url: /^\/[^/]/.test(message.url) ? message.url : null,
    })),
  );
  // الإشعار بيضل ينبعت Push حتى لو الحفظ فشل
  if (inboxError) console.error("notifications: could not save", inboxError);

  const env = pushEnv();
  if (!env) {
    console.warn("push: VAPID keys are missing, nothing was sent");
    return 0;
  }

  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("staff_id", ids);
  if (error) throw new Error(`Could not load push subscriptions: ${error.message}`);

  const payload = JSON.stringify(message);
  const options = {
    vapidDetails: {
      // آبل بترفض subject مش حقيقي: رابط التطبيق
      subject: process.env.VAPID_SUBJECT ?? "https://inv.mekasajo.com",
      publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
    TTL: 60 * 60,
    urgency: "high" as const,
    timeout: 10_000,
  };

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        payload,
        options,
      ),
    ),
  );

  const dead: string[] = [];
  let delivered = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") delivered += 1;
    else {
      const status = (r.reason as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) dead.push(subs[i].id);
      else console.error("push failed", status);
    }
  });
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  if (delivered) {
    await db
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in(
        "id",
        subs.filter((_, i) => results[i].status === "fulfilled").map((s) => s.id),
      );
  }
  return delivered;
}
