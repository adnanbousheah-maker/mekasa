"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushSubscriptionAction } from "../actions";

type Support = "checking" | "unsupported" | "denied" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** زر تفعيل تذكيرات الجرد على هالجوال. بيختفي لما تكون مفعّلة. */
export function EnableNotifications({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [support, setSupport] = useState<Support>("checking");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, startTransition] = useTransition();

  useEffect(() => {
    const check = async (): Promise<Support> => {
      if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window))
        return "unsupported";
      if (Notification.permission === "denied") return "denied";
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      if (!existing) return "off";
      // الاشتراك موجود: منأكده للسيرفر (ممكن يكون الجوال لموظف ثاني قبل)
      await savePushSubscriptionAction(existing.toJSON());
      return "on";
    };
    check()
      .then(setSupport)
      .catch(() => setSupport("unsupported"));
  }, [vapidPublicKey]);

  if (support !== "off" && support !== "denied") return null;

  const enable = () =>
    startTransition(async () => {
      setError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setSupport("denied");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(vapidPublicKey!),
        });
        const result = await savePushSubscriptionAction(sub.toJSON());
        if (result.status === "error") setError(result.message);
        else setSupport("on");
      } catch {
        setError("ما زبط تفعيل التذكيرات على هالجوال");
      }
    });

  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface p-3">
      {support === "denied" ? (
        <p className="text-sm text-muted">
          🔕 تذكير الجرد مسكّر على هالجوال. لتفعيله: افتح إعدادات المتصفح ← المواقع ← ميكاسا ← الإشعارات ←
          سماح. وإذا مش عارف، اسأل المدير.
        </p>
      ) : (
        <button
          type="button"
          disabled={isWorking}
          onClick={enable}
          className="flex h-12 items-center justify-center gap-2 text-base font-semibold disabled:opacity-50"
        >
          🔔 فعّل تذكير الجرد على هالجوال
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
