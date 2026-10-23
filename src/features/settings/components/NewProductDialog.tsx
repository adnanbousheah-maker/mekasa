"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { createProductAction, type NewProductState } from "../actions";
import { PRODUCT_NAME_MAX, SELL_MODE_LABELS, SELL_MODES, type SellMode } from "../schemas";

const field =
  "h-12 rounded-xl border border-line-strong bg-surface px-3 text-base outline-none focus:border-ink";

export function NewProductDialog({ defaultPieces }: { defaultPieces: number }) {
  const [open, setOpen] = useState(false);
  // مفتاح جديد لكل فتحة مشان الفورم يبلش فاضي
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
        className="h-11 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
      >
        + صنف جديد
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="صنف جديد">
        <NewProductForm key={formKey} defaultPieces={defaultPieces} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function NewProductForm({ defaultPieces, onDone }: { defaultPieces: number; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState<NewProductState, FormData>(
    createProductAction,
    undefined,
  );
  const [sellMode, setSellMode] = useState<SellMode>("whole_and_pieces");
  const handled = useRef<NewProductState>(undefined);

  useEffect(() => {
    if (state?.status === "created" && handled.current !== state) {
      handled.current = state;
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">الاسم (متل المنيو)</span>
        <input name="nameEn" dir="ltr" required maxLength={PRODUCT_NAME_MAX} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">الاسم بالعربي (اختياري)</span>
        <input name="nameAr" maxLength={PRODUCT_NAME_MAX} className={field} />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">النوع</legend>
        <div className="flex gap-2">
          {SELL_MODES.map((mode) => (
            <label
              key={mode}
              className={`flex h-12 grow cursor-pointer items-center justify-center rounded-xl border text-[15px] ${sellMode === mode ? "border-ink bg-quiet font-semibold" : "border-line-strong"}`}
            >
              <input
                type="radio"
                name="sellMode"
                value={mode}
                checked={sellMode === mode}
                onChange={() => setSellMode(mode)}
                className="sr-only"
              />
              {SELL_MODE_LABELS[mode]}
            </label>
          ))}
        </div>
      </fieldset>
      {sellMode === "whole_and_pieces" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">قطع بالكيكة</span>
          <input
            name="piecesPerCake"
            inputMode="numeric"
            dir="ltr"
            maxLength={2}
            placeholder={`فاضي = العام (${defaultPieces})`}
            className={`${field} text-right`}
          />
        </label>
      )}
      {state?.status === "error" && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-12 grow rounded-xl bg-ink text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {isPending ? "لحظة…" : "أضف الصنف"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-12 rounded-xl border border-line-strong px-5 text-[17px]"
        >
          رجوع
        </button>
      </div>
    </form>
  );
}
