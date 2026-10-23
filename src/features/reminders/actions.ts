"use server";

import { headers } from "next/headers";
import { requireStaff } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscriptionSchema } from "./subscription";

export type PushResult = { status: "error"; message: string } | { status: "done" };

const MAX_DEVICES = 5;

/**
 * تسجيل جهاز للإشعارات. upsert بالسيرفر: إذا الجوال كان لموظف ثاني (جوال مشترك)
 * بيصير للموظف الداخل هلا. أقدم جهاز بينشال إذا وصل للحد.
 */
export async function savePushSubscriptionAction(subscription: unknown): Promise<PushResult> {
  const staff = await requireStaff();
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { status: "error", message: "هالمتصفح ما بيدعم الإشعارات" };

  const db = createAdminClient();
  const { data: mine } = await db
    .from("push_subscriptions")
    .select("id, endpoint")
    .eq("staff_id", staff.id)
    .order("created_at");
  const others = (mine ?? []).filter((s) => s.endpoint !== parsed.data.endpoint);
  if (others.length >= MAX_DEVICES) {
    await db
      .from("push_subscriptions")
      .delete()
      .in(
        "id",
        others.slice(0, others.length - MAX_DEVICES + 1).map((s) => s.id),
      );
  }

  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const { error } = await db.from("push_subscriptions").upsert(
    {
      staff_id: staff.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth_key: parsed.data.keys.auth,
      user_agent: userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("savePushSubscription", error);
    return { status: "error", message: "ما انحفظ. جرب كمان مرة." };
  }
  return { status: "done" };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<PushResult> {
  const staff = await requireStaff();
  if (typeof endpoint !== "string") return { status: "error", message: "مش موجود" };
  await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("staff_id", staff.id)
    .eq("endpoint", endpoint);
  return { status: "done" };
}
