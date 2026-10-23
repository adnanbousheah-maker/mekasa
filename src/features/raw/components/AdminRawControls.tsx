"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { addUnitAction, createMaterialAction } from "../actions";

const field = "h-11 rounded-xl border border-line-strong bg-surface px-3 outline-none focus:border-ink";

export function NewMaterialButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUnit, setBaseUnit] = useState("كيلو");
  const [minQty, setMinQty] = useState("0");
  const [unitName, setUnitName] = useState("");
  const [unitFactor, setUnitFactor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await createMaterialAction({
        name,
        baseUnit,
        minQty: Number(minQty) || 0,
        unitName,
        unitFactor: unitFactor ? Number(unitFactor) : null,
      });
      if (result.status === "error") setError(result.message);
      else {
        setOpen(false);
        setName("");
        setUnitName("");
        setUnitFactor("");
        setError(null);
      }
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
      >
        + مادة جديدة
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="مادة جديدة">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">الاسم</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">الوحدة الأساسية</span>
              <input
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                maxLength={20}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">الحد الأدنى</span>
              <input
                inputMode="decimal"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">وحدة ثانية (اختياري)</span>
              <input
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="كيس"
                maxLength={20}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">بتساوي كم {baseUnit || "وحدة"}</span>
              <input
                inputMode="decimal"
                value={unitFactor}
                onChange={(e) => setUnitFactor(e.target.value)}
                placeholder="25"
                className={field}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={isSaving}
            onClick={save}
            className="h-12 rounded-xl bg-ink font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "أضف المادة"}
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function AddUnit({ materialId, baseUnit }: { materialId: string; baseUnit: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [factor, setFactor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted underline">
        + وحدة
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        aria-label="اسم الوحدة"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="كرتونة"
        className="h-8 w-20 rounded-lg border border-line-strong px-2 text-xs"
      />
      <span className="text-xs">=</span>
      <input
        aria-label="بتساوي"
        inputMode="decimal"
        value={factor}
        onChange={(e) => setFactor(e.target.value)}
        className="h-8 w-14 rounded-lg border border-line-strong px-2 text-xs"
      />
      <span className="text-xs">{baseUnit}</span>
      <button
        type="button"
        disabled={isSaving}
        onClick={() =>
          startTransition(async () => {
            const result = await addUnitAction(materialId, name, Number(factor));
            if (result.status === "error") setError(result.message);
            else setOpen(false);
          })
        }
        className="h-8 rounded-lg bg-ink px-2 text-xs text-white"
      >
        حفظ
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}
