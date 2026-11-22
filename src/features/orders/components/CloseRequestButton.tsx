"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { closeRequestAction } from "../actions";

/** طلب طلع جزء منه: "سكّر الطلب" يعني الباقي ما رح يطلع (بدونها بيتسكّر لحاله آخر اليوم). */
export function CloseRequestButton({ requestId, branchName }: { requestId: string; branchName: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const close = () =>
    startTransition(async () => {
      const result = await closeRequestAction(requestId);
      if (result.status === "error") setError(result.message);
      else setOpen(false);
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="flex h-12 items-center justify-center rounded-xl border border-line-strong text-[15px]"
      >
        سكّر الطلب
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`سكّر طلب ${branchName}؟`}>
        <p className="mb-4 text-[15px]">الباقي من الطلب ما رح يطلع، والطلب بيختفي من هون.</p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-danger-text">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={close}
            className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "أيوا، سكّره"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-12 items-center justify-center rounded-xl border border-line-strong"
          >
            رجوع
          </button>
        </div>
      </Dialog>
    </>
  );
}
