"use client";

import { useState, useTransition } from "react";
import type { SaveResult } from "../actions";

type Props = {
  label: string;
  initial: string;
  onSave: (value: string) => Promise<SaveResult>;
  numeric?: boolean;
  placeholder?: string;
  className?: string;
};

/** حقل بينحفظ لما تطلع منه (أو Enter). الخطأ بيضل ظاهر والقيمة المكتوبة بتضل لحد ما تنصلح. */
export function InlineField({ label, initial, onSave, numeric = false, placeholder, className = "" }: Props) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startTransition] = useTransition();

  const save = () => {
    if (value.trim() === saved.trim()) return;
    startTransition(async () => {
      const result = await onSave(value);
      if (result.status === "error") {
        setMessage({ tone: "error", text: result.message });
      } else {
        setSaved(value);
        setMessage({ tone: "ok", text: "انحفظ" });
      }
    });
  };

  const invalid = message?.tone === "error";
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <input
        type="text"
        inputMode={numeric ? "numeric" : undefined}
        dir={numeric ? "ltr" : undefined}
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={value}
        disabled={isSaving}
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(saved);
            setMessage(null);
          }
        }}
        className={`h-9 rounded-lg border bg-surface px-2.5 text-sm outline-none focus:border-ink disabled:opacity-60 ${numeric ? "text-center font-semibold" : ""} ${invalid ? "border-danger" : "border-line-strong"} ${className}`}
      />
      {message && (
        <span
          role={invalid ? "alert" : "status"}
          className={`text-[11px] ${invalid ? "text-danger-text" : "text-ok-text"}`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}
