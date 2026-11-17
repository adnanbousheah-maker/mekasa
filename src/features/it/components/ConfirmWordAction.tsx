"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

type Result = { status: "error"; message: string } | { status: "done"; message?: string };

type Props = {
  word: string;
  label: string;
  buttonLabel: string;
  doneMessage: string;
  onConfirm: (word: string) => Promise<Result>;
};

/** فعل ما بيرجع: بيشتغل بس بعد ما تنكتب الكلمة بالضبط. */
export function ConfirmWordAction({ word, label, buttonLabel, doneMessage, onConfirm }: Props) {
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isRunning, startTransition] = useTransition();
  const ready = typed.trim() === word;

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await onConfirm(typed);
      if (result.status === "error") setMessage({ ok: false, text: result.message });
      else {
        setTyped("");
        setMessage({ ok: true, text: result.message ?? doneMessage });
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">
          {label} اكتب <strong className="text-ink">{word}</strong>
        </span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="h-12 rounded-xl border border-line bg-surface px-3 text-base"
          autoComplete="off"
        />
      </label>
      <Button variant="danger" size="md" onClick={run} disabled={!ready || isRunning}>
        {isRunning ? "لحظة…" : buttonLabel}
      </Button>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-ok-text" : "text-danger-text"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
