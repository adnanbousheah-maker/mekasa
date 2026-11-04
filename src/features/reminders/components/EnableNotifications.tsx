"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushSubscriptionAction } from "../actions";

type Support = "checking" | "unsupported" | "ios-browser" | "denied" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const bytes = new Uint8Array(a);
  return bytes.length === b.length && bytes.every((v, i) => v === b[i]);
}

// الآيفون: الإشعارات بس بعد "أضف للشاشة الرئيسية" والفتح من الأيقونة
function isIosBrowserTab(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** زر تفعيل الإشعارات على هالجوال. بيختفي لما تكون مفعّلة. */
export function EnableNotifications({
  vapidPublicKey,
  label = "🔔 فعّل تذكير الجرد على هالجوال",
}: {
  vapidPublicKey: string | null;
  label?: string;
}) {
  const [support, setSupport] = useState<Support>("checking");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, startTransition] = useTransition();

  useEffect(() => {
    const check = async (): Promise<Support> => {
      if (!vapidPublicKey) return "unsupported";
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        return isIosBrowserTab() ? "ios-browser" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      if (!existing) return "off";
      // اشتراك بمفتاح قديم ما بيوصله شي: منشيله ومنطلب من جديد
      if (!sameKey(existing.options.applicationServerKey, base64UrlToBytes(vapidPublicKey))) {
        await existing.unsubscribe();
        return "off";
      }
      // الاشتراك موجود: منأكده للسيرفر (ممكن يكون الجوال لموظف ثاني قبل)
      const saved = await savePushSubscriptionAction(existing.toJSON());
      return saved.status === "done" ? "on" : "off";
    };
    check()
      .then(setSupport)
      .catch(() => setSupport("unsupported"));
  }, [vapidPublicKey]);

  if (support === "ios-browser") {
    return (
      <p className="rounded-[14px] border border-line bg-surface p-3 text-sm leading-relaxed text-muted">
        🔔 لتوصلك التذكيرات على الآيفون: اكبس زر المشاركة ← «أضف إلى الشاشة الرئيسية»، وافتح ميكاسا من
        الأيقونة اللي انضافت.
      </p>
    );
  }
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
          🔕 الإشعارات مسكّرة على هالجوال. لتفعيله: افتح إعدادات المتصفح ← المواقع ← ميكاسا ← الإشعارات ←
          سماح. وإذا مش عارف، اسأل المدير.
        </p>
      ) : (
        <button
          type="button"
          disabled={isWorking}
          onClick={enable}
          className="flex h-12 items-center justify-center gap-2 text-base font-semibold disabled:opacity-50"
        >
          {label}
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
