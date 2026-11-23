"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { addCountLineAction } from "../actions";

type Product = { id: string; name: string; piecesPerCake: number | null };

const field = "h-11 rounded-xl border border-line-strong bg-surface px-3 outline-none focus:border-ink";
const toInt = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))) || 0;

/** الأدمن: صنف ما انعدّ (مثلاً كان موقوف وقت الجرد) بينضاف للجرد المؤكد بسبب. */
export function AddCountLine({
  countId,
  products,
  isFactory,
  countDate,
}: {
  countId: string;
  products: Product[];
  isFactory: boolean;
  countDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [date, setDate] = useState(countDate);
  const [frozen, setFrozen] = useState(false);
  const [cakes, setCakes] = useState("");
  const [pieces, setPieces] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const product = products.find((p) => p.id === productId);
  const piecesOnly = product ? product.piecesPerCake === null : false;

  const save = () =>
    startTransition(async () => {
      if (!product) {
        setError("اختار الصنف");
        return;
      }
      const result = await addCountLineAction({
        countId,
        productId,
        productionDate: isFactory ? date : null,
        frozen: isFactory && frozen,
        wholeCakes: piecesOnly ? 0 : toInt(cakes),
        loosePieces: toInt(pieces),
        reason,
      });
      if (result.status === "error") setError(result.message);
      else {
        setOpen(false);
        setProductId("");
        setCakes("");
        setPieces("");
        setReason("");
        setFrozen(false);
        setError(null);
      }
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="h-11 self-start rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold"
      >
        + ضيف صنف ما انعدّ
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="ضيف صنف للجرد">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            لصنف ما كان بالجرد (مثلاً كان موقوف). الستوك بيتصحح من وقت الجرد، والتعديل بينسجل بسجل التعديلات.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">الصنف</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
              <option value="">اختار…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {isFactory && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">تاريخ الإنتاج</span>
                <input
                  type="date"
                  value={date}
                  max={countDate}
                  onChange={(e) => setDate(e.target.value)}
                  className={field}
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-2.5">
                <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} />
                <span className="text-sm">❄ مفرّز</span>
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {!piecesOnly && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">كيكات</span>
                <input
                  inputMode="numeric"
                  value={cakes}
                  onChange={(e) => setCakes(e.target.value)}
                  className={field}
                />
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">قطع</span>
              <input
                inputMode="numeric"
                value={pieces}
                onChange={(e) => setPieces(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">السبب</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلاً: كان موقوف وقت الجرد"
              maxLength={300}
              className={field}
            />
          </label>
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
            {isSaving ? "لحظة…" : "ضيف للجرد"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
