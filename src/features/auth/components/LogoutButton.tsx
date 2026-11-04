"use client";

import { removePushSubscriptionAction } from "@/features/reminders/actions";
import { logout } from "../actions";

type Props = {
  className?: string;
};

/** قبل الخروج بنشيل إشعارات هالجوال عن الموظف، مشان الجوال المشترك ما يضل يوصله إشعارات غيره. */
async function forgetThisDevice() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await removePushSubscriptionAction(sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // الخروج أهم من الإشعارات
  }
}

export function LogoutButton({ className = "" }: Props) {
  return (
    <form
      action={async () => {
        await forgetThisDevice();
        await logout();
      }}
    >
      <button
        type="submit"
        className={`min-h-12 px-4 text-[15px] text-muted underline-offset-4 hover:underline ${className}`}
      >
        تسجيل الخروج
      </button>
    </form>
  );
}
