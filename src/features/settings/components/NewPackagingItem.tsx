"use client";

import { useState, useTransition } from "react";
import { createPackagingItemAction } from "../actions";

export function NewPackagingItem() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSaving, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const result = await createPackagingItemAction(name);
      if (result.status === "error") setMessage({ ok: false, text: result.message });
      else {
        setMessage({ ok: true, text: `انضافت: ${name.trim()}` });
        setName("");
      }
    });

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        aria-label="اسم مادة التغليف"
        placeholder="مثلاً: علبة كيكة كبيرة"
        className="h-10 w-56 rounded-xl border border-line-strong bg-surface px-3"
      />
      <button
        type="submit"
        disabled={isSaving || !name.trim()}
        className="h-10 rounded-xl bg-ink px-4 font-semibold text-white disabled:opacity-40"
      >
        + مادة تغليف
      </button>
      {message && (
        <span role="status" className={`text-sm ${message.ok ? "text-ok-text" : "text-danger-text"}`}>
          {message.text}
        </span>
      )}
    </form>
  );
}
