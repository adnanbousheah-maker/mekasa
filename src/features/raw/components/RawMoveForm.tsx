"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { PhotoPicker } from "@/features/photos/components/PhotoPicker";
import { recordRawReceiptAction } from "../actions";
import { amount } from "../logic";
import type { RawMaterialRow } from "../queries";

const chip = (on: boolean) =>
  `h-11 rounded-full px-4 text-sm ${on ? "border-2 border-ink bg-quiet font-semibold" : "border border-line-strong bg-surface"}`;

type Line = { key: number; materialId: string; unitId: string | null; qty: string };

const toNumber = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));

/**
 * design/factory/RawMove: استلام من مورد، كذا مادة بمرة وحدة (اجتماع 20 نوفمبر)، كل مادة بتعبئتها.
 * الصرف انسكّر: المصروف بينحسب من الجرد اليومي.
 */
export function RawMoveForm({
  materials,
  suppliers = [],
}: {
  materials: RawMaterialRow[];
  suppliers?: string[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const byId = new Map(materials.map((m) => [m.id, m]));

  const add = (id: string) => {
    const m = byId.get(id);
    setLines((ls) => [
      ...ls,
      { key: Date.now() + ls.length, materialId: id, unitId: m?.units[0]?.id ?? null, qty: "1" },
    ]);
    setPicking(false);
  };
  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const valid = lines.length > 0 && lines.every((l) => toNumber(l.qty) > 0);

  const submit = () =>
    startTransition(async () => {
      const result = await recordRawReceiptAction({
        lines: lines.map((l) => ({ materialId: l.materialId, unitId: l.unitId, qty: toNumber(l.qty) })),
        supplierName: supplier,
        invoicePhotoPath: invoice,
      });
      if (result.status === "error") setError(result.message);
      else router.replace("/factory/raw?saved=1");
    });

  return (
    <div className="flex grow flex-col gap-5">
      <ul className="flex flex-col gap-3" aria-label="المواد المستلمة">
        {lines.map((l) => {
          const m = byId.get(l.materialId)!;
          const unit = m.units.find((u) => u.id === l.unitId) ?? null;
          const n = toNumber(l.qty);
          const base = Number.isFinite(n) ? n * (unit?.factor ?? 1) : 0;
          return (
            <li
              key={l.key}
              aria-label={m.name}
              className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[17px] font-semibold">{m.name}</span>
                <button
                  type="button"
                  aria-label={`شيل ${m.name}`}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="h-10 rounded-lg px-3 text-sm text-danger-text"
                >
                  شيل
                </button>
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`وحدة ${m.name}`}>
                {m.units.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    role="radio"
                    aria-checked={l.unitId === u.id}
                    onClick={() => update(l.key, { unitId: u.id })}
                    className={chip(l.unitId === u.id)}
                  >
                    {u.name} ({amount(u.factor, m.baseUnit)})
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={l.unitId === null}
                  onClick={() => update(l.key, { unitId: null })}
                  className={chip(l.unitId === null)}
                >
                  {m.baseUnit}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <input
                  inputMode="decimal"
                  aria-label={`كمية ${m.name}`}
                  value={l.qty}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                  className="h-12 w-28 rounded-xl border border-line-strong text-center text-xl font-bold"
                />
                <span className="text-sm text-muted">
                  = {amount(base, m.baseUnit)} · بيصير الموجود {amount(m.qty + base, m.baseUnit)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex h-14 items-center justify-center rounded-[14px] border-2 border-dashed border-line-strong text-[17px] font-semibold"
      >
        + {lines.length === 0 ? "اختار المادة" : "ضيف مادة ثانية"}
      </button>

      <div className="flex flex-col gap-3">
        {suppliers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">المورد (اختياري)</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="المورد">
              {suppliers.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={supplier === name}
                  onClick={() => setSupplier(supplier === name ? "" : name)}
                  className={`min-h-12 rounded-xl px-3.5 text-[15px] ${supplier === name ? "border-2 border-ink bg-quiet font-semibold" : "border border-line-strong bg-surface"}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold">
            {suppliers.length > 0 ? "مورد ثاني (اكتبه)" : "المورد (اختياري)"}
          </span>
          <input
            value={suppliers.includes(supplier) ? "" : supplier}
            maxLength={80}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="اسم المورد"
            className="h-12 rounded-xl border border-line-strong bg-surface px-3"
          />
        </label>
        <PhotoPicker bucket="invoices" label="صورة الفاتورة (اختياري)" onUploaded={setInvoice} />
      </div>

      <div className="grow" />
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger-text">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={isSaving || !valid}
        onClick={submit}
        className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
      >
        {isSaving ? "لحظة…" : lines.length > 1 ? `سجّل استلام ${lines.length} مواد` : "سجّل الاستلام"}
      </button>

      <Dialog open={picking} onClose={() => setPicking(false)} title="اختار المادة">
        <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
          {materials.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => add(m.id)}
                className="flex h-12 w-full items-center justify-between rounded-xl px-3 hover:bg-quiet"
              >
                <span className="font-semibold">{m.name}</span>
                <span className="text-sm text-muted">{amount(m.qty, m.baseUnit)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
