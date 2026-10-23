"use client";

import { useState, useTransition } from "react";
import { DayBadge } from "@/components/ui/DayBadge";
import { ProductName } from "@/components/ui/ProductName";
import { dayNumberOf } from "@/lib/day-number";
import { formatQuantity } from "@/lib/units";
import { decideReturnAction } from "../actions";
import type { OpenReturn } from "../queries";

/** قرار على مرتجع: كم يرجع للستوك (وعلى أي دفعة)، وكم تالف. الكميات بالقطع. */
export function ReturnDecision({ item, dates }: { item: OpenReturn; dates: string[] }) {
  const [toStock, setToStock] = useState(item.remaining);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const toWaste = item.remaining - toStock;

  const save = () =>
    startTransition(async () => {
      const result = await decideReturnAction({
        receiptLineId: item.receiptLineId,
        toStock,
        toWaste,
        productionDate: date,
      });
      setError(result.status === "error" ? result.message : null);
    });

  return (
    <li
      aria-label={item.productName}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-col">
        <ProductName name={item.productName} className="text-[17px] font-semibold" />
        <span className="text-sm text-muted">
          من فرع {item.fromName} · {formatQuantity(item.remaining, item.piecesPerCake)}
        </span>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">
          للستوك: {formatQuantity(toStock, item.piecesPerCake)} · تالف:{" "}
          {formatQuantity(toWaste, item.piecesPerCake)}
        </span>
        <input
          type="range"
          min={0}
          max={item.remaining}
          step={item.piecesPerCake ?? 1}
          value={toStock}
          aria-label={`كم يرجع للستوك من ${item.productName}`}
          onChange={(e) => setToStock(Number(e.target.value))}
          className="h-12"
        />
      </label>
      {toStock > 0 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="يرجع على دفعة رقم">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={date === d}
              aria-label={`رقم ${dayNumberOf(d)}`}
              onClick={() => setDate(d)}
              className={`flex h-12 items-center rounded-full px-1.5 ${date === d ? "border-2 border-ink bg-quiet" : "border border-line-strong"}`}
            >
              <DayBadge day={dayNumberOf(d)} />
            </button>
          ))}
        </div>
      )}
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
        {isSaving ? "لحظة…" : "احفظ القرار"}
      </button>
    </li>
  );
}
