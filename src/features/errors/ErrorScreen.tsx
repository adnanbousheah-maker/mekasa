"use client";

import { useEffect } from "react";
import { reportClientErrorAction } from "./actions";

/** شاشة الخطأ بالعربي: بتبعت الخطأ لسجلات السيرفر، وزر يجرّب كمان مرة أو يحدّث الصفحة. */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const e = error instanceof Error ? (error as Error & { digest?: string }) : null;
    reportClientErrorAction({
      message: e?.message ?? String(error),
      digest: e?.digest,
      stack: e?.stack,
      path: window.location.pathname,
    }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden="true" className="text-4xl">
        ⚠
      </span>
      <h1 className="text-[22px] font-bold">صار خطأ بهالشاشة</h1>
      <p className="text-base text-muted">
        اللي حفظته قبل ما بيضيع. جرّب كمان مرة، وإذا رجع الخطأ حدّث الصفحة.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="flex h-14 w-full items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white"
      >
        جرّب كمان مرة
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-line-strong text-base"
      >
        حدّث الصفحة
      </button>
    </main>
  );
}
