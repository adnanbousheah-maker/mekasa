import "server-only";
import webpush from "web-push";
import { pushEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PushMessage } from "./subscription";

/**
 * بيبعت إشعار لكل أجهزة هالموظفين. الاشتراكات الميتة (404/410) بتنحذف.
 * بيرجع عدد الأجهزة اللي وصلها.
 */
export async function sendPushToStaff(staffIds: string[], message: PushMessage): Promise<number> {
  const env = pushEnv();
  if (!env || staffIds.length === 0) return 0;

  const db = createAdminClient();
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("staff_id", staffIds);
  if (error) throw new Error(`Could not load push subscriptions: ${error.message}`);

  const payload = JSON.stringify(message);
  const options = {
    vapidDetails: {
      subject: "mailto:admin@mekasa.local",
      publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
    TTL: 60 * 60,
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
