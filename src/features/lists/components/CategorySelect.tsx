"use client";

import { useState, useTransition } from "react";
import { setCategoryAction } from "../actions";

export type CategoryChoice = { id: string; name: string; depth: 0 | 1 };

/** تصنيف عنصر (بينحفظ فوراً). الفرعي بيبين تحت رئيسه. */
export function CategorySelect({
  target,
  itemId,
  itemName,
  value,
  choices,
}: {
  target: "product" | "raw";
  itemId: string;
  itemName: string;
  value: string | null;
  choices: CategoryChoice[];
}) {
  const [current, setCurrent] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label={`تصنيف ${itemName}`}
        value={current}
        disabled={isSaving}
        onChange={(e) => {
          const before = current;
          const next = e.target.value;
          setCurrent(next);
          startTransition(async () => {
            const r = await setCategoryAction(target, itemId, next || null);
            if (r.status === "error") {
              setCurrent(before);
              setError(r.message);
            } else setError(null);
          });
        }}
        className="h-9 max-w-40 rounded-lg border border-line-strong bg-surface px-2 text-sm"
      >
        <option value="">بدون تصنيف</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.depth ? `↳ ${c.name}` : c.name}
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
