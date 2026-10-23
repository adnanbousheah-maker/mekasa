"use client";

import { useState, useTransition } from "react";
import { decideRequestAction, resolveReceiptLineAction } from "../actions";

const small = "h-10 rounded-[10px] px-3.5 text-sm font-semibold disabled:opacity-40";

/** موافقة أو رفض طلب (لما موافقة الأدمن مفعّلة). */
export function ApproveRequest({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const decide = (approve: boolean) =>
    startTransition(async () => {
      const result = await decideRequestAction(requestId, approve);
      setError(result.status === "error" ? result.message : null);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={isSaving}
        onClick={() => decide(true)}
        className={`${small} bg-ink text-white`}
      >
        وافق وابعته للمصنع
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => decide(false)}
        className={`${small} border border-danger-line text-danger-text`}
      >
        ارفض
      </button>
      {error && (
        <span role="alert" className="text-sm text-danger-text">
          {error}
        </span>
      )}
    </div>
  );
}

/** قرار على فرق الاستلام: تالف، مراجعة، أو انحل. */
export function ResolveDifference({ lineIds }: { lineIds: string[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const resolve = (resolution: "waste" | "review" | "resolved") =>
    startTransition(async () => {
      for (const lineId of lineIds) {
        const result = await resolveReceiptLineAction({ lineId, resolution });
        if (result.status === "error") return setError(result.message);
      }
      setError(null);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={isSaving}
        onClick={() => resolve("waste")}
        className={`${small} bg-ink text-white`}
      >
        اعتمد الفرق كتالف
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => resolve("review")}
        className={`${small} border border-line-strong`}
      >
        علّق للمراجعة
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => resolve("resolved")}
        className={`${small} border border-line-strong`}
      >
        انحل
      </button>
      {error && (
        <span role="alert" className="text-sm text-danger-text">
          {error}
        </span>
      )}
    </div>
  );
}
