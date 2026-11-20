"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { cancelRequestAction, decideRequestAction, resolveReceiptLineAction } from "../actions";

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

/** حذف طلب ما طلع لسا (الأدمن والمدير العام). الطلب بينلغى وبيضل بالسجل، وبيطلع من مجموع طلبات اليوم. */
export function CancelRequest({ requestId, branchName }: { requestId: string; branchName: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const cancel = () =>
    startTransition(async () => {
      const result = await cancelRequestAction(requestId);
      if (result.status === "error") setError(result.message);
      else {
        setError(null);
        setOpen(false);
      }
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${small} border border-danger-line text-danger-text`}
      >
        احذف الطلب
      </button>
      {error && (
        <span role="alert" className="text-sm text-danger-text">
          {error}
        </span>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="حذف الطلب">
        <p className="text-[15px]">
          متأكد بدك تحذف طلب {branchName}؟ ما رح يطلع من المصنع، وبيطلع من مجموع طلبات اليوم. بيضل بالسجل كطلب
          ملغي.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={cancel}
            className="h-12 rounded-xl bg-danger font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? "لحظة…" : "احذفه"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-12 rounded-xl border border-line-strong font-semibold"
          >
            رجوع
          </button>
        </div>
      </Dialog>
    </div>
  );
}
