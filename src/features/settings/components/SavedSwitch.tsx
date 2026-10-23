"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/Switch";
import type { SaveResult } from "../actions";

type Props = {
  label: string;
  initial: boolean;
  onSave: (next: boolean) => Promise<SaveResult>;
  size?: "sm" | "md";
  // نص الحالة جنب المفتاح (مثلاً "مفعّل" / "موقوف")
  states?: { on: string; off: string };
};

/** مفتاح بيتغير فوراً وبيرجع لحالته إذا ما انحفظ. */
export function SavedSwitch({ label, initial, onSave, size, states }: Props) {
  const [checked, setChecked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const change = (next: boolean) => {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await onSave(next);
      if (result.status === "error") {
        setChecked(!next);
        setError(result.message);
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className="inline-flex items-center gap-2.5">
        {states && <span className="text-sm text-muted">{checked ? states.on : states.off}</span>}
        <Switch label={label} checked={checked} onChange={change} disabled={isSaving} size={size} />
      </span>
      {error && (
        <span role="alert" className="text-[11px] text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}
