"use client";

import { useState, useTransition } from "react";
import { updateProductSellModeAction } from "../actions";
import { SELL_MODE_LABELS, SELL_MODES, type SellMode } from "../schemas";

/** نوع الصنف (كيكة وقطع، أو قطعة بس). بينحفظ فوراً، وبيرجع للقديم إذا فشل. */
export function SellModeSelect({
  productId,
  name,
  value,
}: {
  productId: string;
  name: string;
  value: SellMode;
}) {
  const [current, setCurrent] = useState<SellMode>(value);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label={`نوع ${name}`}
        value={current}
        disabled={isSaving}
        onChange={(e) => {
          const before = current;
          const next = e.target.value as SellMode;
          setCurrent(next);
          startTransition(async () => {
            const r = await updateProductSellModeAction(productId, next);
            if (r.status === "error") {
              setCurrent(before);
              setError(r.message);
            } else setError(null);
          });
        }}
        className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
      >
        {SELL_MODES.map((m) => (
          <option key={m} value={m}>
            {SELL_MODE_LABELS[m]}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-[11px] text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}
