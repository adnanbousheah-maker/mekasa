"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { markRequestOutAction } from "../actions";

/**
 * فترة التجربة: الطلبية طلعت برا النظام، فمسؤول المصنع بيعلّمها "طلعت" وبتختفي من هون.
 * ما في إخراج ولا حركة ستوك. IT بيطفي الزر من /admin/it.
 */
export function MarkRequestOutButton({ requestId, branchName }: { requestId: string; branchName: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const mark = () =>
    startTransition(async () => {
      const result = await markRequestOutAction(requestId);
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
        تم إخراج الطلبية
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`طلبية ${branchName} طلعت؟`}>
        <p className="mb-4 text-[15px]">
          الطلبية بتختفي من هون وبتنعلّم إنها طلعت. ما بتنقص من ستوك المصنع، لأنها طلعت بدون شاشة الإخراج.
        </p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-danger-text">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={mark}
            className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "أيوا، طلعت"}
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
