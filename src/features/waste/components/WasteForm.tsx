"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DayBadge } from "@/components/ui/DayBadge";
import { Dialog } from "@/components/ui/Dialog";
import { ProductName } from "@/components/ui/ProductName";
import type { CountProduct, FactoryBatch } from "@/features/counts/queries";
import { PhotoPicker } from "@/features/photos/components/PhotoPicker";
import { DAY_NAMES, dayNumberOf } from "@/lib/day-number";
import { recordWasteAction } from "../actions";
import { WASTE_REASON_LABELS, WASTE_REASONS, wasteSubmitLabel, type WasteReason } from "../schemas";

type Props = {
  products: CountProduct[];
  // المصنع بس: الدفعات اللي إلها ستوك، والتواريخ الممكنة
  factory?: { batches: FactoryBatch[]; dates: string[] };
};

const segment = (on: boolean) =>
  `h-10 rounded-[9px] text-[15px] ${on ? "bg-surface font-semibold shadow-sm" : "text-muted"}`;

/** design/branch/Waste: صنف، كمية (كيكة أو قطعة)، سبب، صورة اختيارية. */
export function WasteForm({ products, factory }: Props) {
  const [productId, setProductId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [unit, setUnit] = useState<"cake" | "piece">("cake");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<WasteReason>("expired");
  const [note, setNote] = useState("");
  const [productionDate, setProductionDate] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const product = products.find((p) => p.id === productId) ?? null;
  const piecesOnly = product?.piecesPerCake === null;
  const effectiveUnit = piecesOnly ? "piece" : unit;
  const productBatches =
    factory?.batches.filter((b) => b.productId === productId).map((b) => b.productionDate) ?? [];
  const dateChoices = factory
    ? [...new Set([...productBatches, ...factory.dates])].sort((a, b) => a.localeCompare(b))
    : [];

  const reset = () => {
    setProductId(null);
    setQty(1);
    setUnit("cake");
    setReason("expired");
    setNote("");
    setProductionDate(null);
    setPhotoPath(null);
    setDone(null);
  };

  const submit = () => {
    if (!product) return setError("اختار الصنف");
    if (factory && !productionDate) return setError("اختار رقم الدفعة");
    setError(null);
    startTransition(async () => {
      const result = await recordWasteAction({
        productId: product.id,
        unit: effectiveUnit,
        qty,
        reason,
        note,
        productionDate,
        photoPath,
      });
      if (result.status === "error") setError(result.message);
      else setDone(`${wasteSubmitLabel(qty, effectiveUnit).replace("سجّل ", "")} ${product.nameEn}`);
    });
  };

  if (done) {
    return (
      <div className="flex grow flex-col items-center gap-5 pt-16 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-ok-soft text-ok">
          <svg
            width="52"
            height="52"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold">انسجل التالف</h2>
        <p dir="auto" className="text-[17px] text-muted">
          {done}
        </p>
        <div className="grow" />
        <button
          type="button"
          onClick={reset}
          className="h-14 w-full rounded-[14px] border border-line-strong bg-surface text-lg font-semibold"
        >
          سجّل تالف ثاني
        </button>
        <Link
          href="/"
          className="flex h-14 w-full items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white"
        >
          رجوع للرئيسية
        </Link>
      </div>
    );
  }

  return (
    <div className="flex grow flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">الصنف</span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex h-16 items-center gap-3 rounded-[14px] border border-line-strong bg-surface px-3.5 text-right"
        >
          {product ? (
            <ProductName name={product.nameEn} className="grow text-[17px] font-semibold" />
          ) : (
            <span className="grow text-[17px] text-muted">اختار الصنف</span>
          )}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-muted"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {factory && product && (
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold">رقم الدفعة</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="رقم الدفعة">
            {dateChoices.map((d) => {
              const day = dayNumberOf(d);
              const on = productionDate === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`رقم ${day}، ${DAY_NAMES[day]}`}
                  onClick={() => setProductionDate(d)}
                  className={`flex h-12 items-center rounded-full px-1.5 ${on ? "border-2 border-ink bg-quiet" : "border border-line-strong"}`}
                >
                  <DayBadge day={day} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">الكمية</span>
        {!piecesOnly && (
          <div
            className="grid h-12 grid-cols-2 rounded-xl bg-quiet-strong p-1"
            role="radiogroup"
            aria-label="الوحدة"
          >
            <button
              type="button"
              role="radio"
              aria-checked={unit === "cake"}
              onClick={() => setUnit("cake")}
              className={segment(unit === "cake")}
            >
              كيكة كاملة
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={unit === "piece"}
              onClick={() => setUnit("piece")}
              className={segment(unit === "piece")}
            >
              قطعة
            </button>
          </div>
        )}
        <div className="flex h-16 items-center justify-between overflow-hidden rounded-[14px] border border-line-strong bg-surface">
          <button
            type="button"
            aria-label="زيد"
            onClick={() => setQty((q) => Math.min(999, q + 1))}
            className="flex size-16 items-center justify-center bg-quiet text-[28px]"
          >
            +
          </button>
          <span role="status" aria-label={`الكمية: ${qty}`} className="text-[28px] font-bold tabular-nums">
            {qty}
          </span>
          <button
            type="button"
            aria-label="نقّص"
            disabled={qty <= 1}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex size-16 items-center justify-center bg-quiet text-[28px] disabled:text-line-strong"
          >
            −
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">السبب</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="السبب">
          {WASTE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={`h-[52px] rounded-xl text-base ${reason === r ? "border-2 border-ink bg-quiet font-semibold" : "border border-line-strong bg-surface"}`}
            >
              {WASTE_REASON_LABELS[r]}
            </button>
          ))}
        </div>
        {reason === "other" && (
          <input
            aria-label="شو صار؟"
            placeholder="شو صار؟"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-12 rounded-xl border border-line-strong bg-surface px-3 text-base outline-none focus:border-ink"
          />
        )}
      </div>

      <PhotoPicker bucket="waste-photos" label="أضف صورة (اختياري)" onUploaded={setPhotoPath} />

      <div className="grow" />
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger-text">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={isSaving}
        onClick={submit}
        className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-50"
      >
        {isSaving ? "لحظة…" : wasteSubmitLabel(qty, effectiveUnit)}
      </button>

      <Dialog open={picking} onClose={() => setPicking(false)} title="اختار الصنف">
        <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
          {products.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setProductId(p.id);
                  setProductionDate(null);
                  setPicking(false);
                }}
                className={`flex h-12 w-full items-center rounded-xl px-3 ${p.id === productId ? "bg-quiet font-semibold" : ""}`}
              >
                <ProductName name={p.nameEn} className="grow text-[16px]" />
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
