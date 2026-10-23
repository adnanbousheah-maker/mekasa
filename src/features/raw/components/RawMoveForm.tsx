"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { PhotoPicker } from "@/features/photos/components/PhotoPicker";
import { recordRawMoveAction } from "../actions";
import { amount } from "../logic";
import type { RawMaterialRow } from "../queries";

const segment = (on: boolean) =>
  `h-11 rounded-[10px] text-[15px] ${on ? "bg-surface font-semibold shadow-sm" : "text-muted"}`;
const chip = (on: boolean) =>
  `h-11 rounded-full px-4 text-sm ${on ? "border-2 border-ink bg-quiet font-semibold" : "border border-line-strong bg-surface"}`;

/** design/factory/RawMove: استلام من مورد أو صرف للإنتاج، بأي وحدة مع التحويل. */
export function RawMoveForm({
  materials,
  initialKind,
}: {
  materials: RawMaterialRow[];
  initialKind: "receipt" | "issue";
}) {
  const router = useRouter();
  const [kind, setKind] = useState(initialKind);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const material = materials.find((m) => m.id === materialId) ?? null;
  const unit = material?.units.find((u) => u.id === unitId) ?? null;
  const n = Number(qty.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
  const base = Number.isFinite(n) ? n * (unit?.factor ?? 1) : 0;
  const after = material ? material.qty + (kind === "receipt" ? base : -base) : 0;

  const pick = (id: string) => {
    const m = materials.find((x) => x.id === id);
    setMaterialId(id);
    setUnitId(kind === "receipt" ? (m?.units[0]?.id ?? null) : null);
    setPicking(false);
  };

  const submit = () =>
    startTransition(async () => {
      if (!material) return setError("اختار المادة");
      const result = await recordRawMoveAction({
        materialId: material.id,
        kind,
        qty: n,
        unitId,
        supplierName: supplier,
        invoicePhotoPath: invoice,
      });
      if (result.status === "error") setError(result.message);
      else router.replace("/factory/raw?saved=1");
    });

  const step = (d: number) =>
    setQty(String(Math.max(0, Math.round(((Number.isFinite(n) ? n : 0) + d) * 1000) / 1000)));

  return (
    <div className="flex grow flex-col gap-5">
      <div
        className="grid h-12 grid-cols-2 rounded-xl bg-quiet-strong p-1"
        role="radiogroup"
        aria-label="النوع"
      >
        <button
          type="button"
          role="radio"
          aria-checked={kind === "receipt"}
          onClick={() => setKind("receipt")}
          className={segment(kind === "receipt")}
        >
          استلام من مورد
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={kind === "issue"}
          onClick={() => setKind("issue")}
          className={segment(kind === "issue")}
        >
          صرف للإنتاج
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">المادة</span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex h-16 items-center gap-3 rounded-[14px] border border-line-strong bg-surface px-3.5 text-right"
        >
          <span className="grow text-[17px] font-semibold">
            {material?.name ?? <span className="font-normal text-muted">اختار المادة</span>}
          </span>
          {material && (
            <span className="text-sm text-muted">موجود {amount(material.qty, material.baseUnit)}</span>
          )}
        </button>
      </div>

      {material && (
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold">الكمية</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الوحدة">
            {material.units.map((u) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={unitId === u.id}
                onClick={() => setUnitId(u.id)}
                className={chip(unitId === u.id)}
              >
                {u.name} ({amount(u.factor, material.baseUnit)})
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={unitId === null}
              onClick={() => setUnitId(null)}
              className={chip(unitId === null)}
            >
              {material.baseUnit}
            </button>
          </div>
          <div className="flex h-16 items-center justify-between overflow-hidden rounded-[14px] border border-line-strong bg-surface">
            <button
              type="button"
              aria-label="زيد"
              onClick={() => step(1)}
              className="flex size-16 items-center justify-center bg-quiet text-[28px]"
            >
              +
            </button>
            <input
              inputMode="decimal"
              aria-label="الكمية"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-24 bg-transparent text-center text-[26px] font-bold outline-none"
            />
            <button
              type="button"
              aria-label="نقّص"
              onClick={() => step(-1)}
              className="flex size-16 items-center justify-center bg-quiet text-[28px]"
            >
              −
            </button>
          </div>
          <span className={`text-sm ${after < 0 ? "font-semibold text-danger-text" : "text-muted"}`}>
            = {amount(base, material.baseUnit)} · بعدها بيصير الموجود {amount(after, material.baseUnit)}
            {after < 0 ? " (أكثر من الموجود!)" : ""}
          </span>
        </div>
      )}

      {kind === "receipt" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">المورد (اختياري)</span>
            <input
              value={supplier}
              maxLength={80}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="اسم المورد"
              className="h-12 rounded-xl border border-line-strong bg-surface px-3"
            />
          </label>
          <PhotoPicker bucket="invoices" label="صورة الفاتورة (اختياري)" onUploaded={setInvoice} />
        </div>
      )}

      <div className="grow" />
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger-text">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={isSaving || !material || !(n > 0)}
        onClick={submit}
        className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
      >
        {isSaving ? "لحظة…" : kind === "receipt" ? "سجّل الاستلام" : "سجّل الصرف"}
      </button>

      <Dialog open={picking} onClose={() => setPicking(false)} title="اختار المادة">
        <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
          {materials.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => pick(m.id)}
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
