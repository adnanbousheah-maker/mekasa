"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ROLE_LABELS, ROLES, type Role } from "@/features/staff/roles";
import { createOptionAction, deleteOptionAction, moveOptionAction, updateOptionAction } from "../actions";
import { COLOR_LABELS, OPTION_COLORS, type OptionColor } from "../types";

const control = "h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm";

function useSave() {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.status === "error") setError(r.message ?? "ما انحفظ");
    });
  return { error, isSaving, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <span role="alert" className="text-[11px] text-danger-text">
      {error}
    </span>
  ) : null;
}

export function NewOption({ listKey, label }: { listKey: string; label: string }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSaving, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await createOptionAction(listKey, name);
          if (r.status === "error") setMessage({ ok: false, text: r.message });
          else {
            setMessage({ ok: true, text: `انضاف: ${name.trim()}` });
            setName("");
          }
        });
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        aria-label={`خيار جديد بـ${label}`}
        placeholder="اسم الخيار الجديد"
        className="h-10 w-56 rounded-xl border border-line-strong bg-surface px-3"
      />
      <button
        type="submit"
        disabled={isSaving || !name.trim()}
        className="h-10 rounded-xl bg-ink px-4 font-semibold text-white disabled:opacity-40"
      >
        + أضف
      </button>
      {message && (
        <span role="status" className={`text-sm ${message.ok ? "text-ok-text" : "text-danger-text"}`}>
          {message.text}
        </span>
      )}
    </form>
  );
}

export function MoveButtons({
  id,
  name,
  first,
  last,
}: {
  id: string;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const { error, isSaving, run } = useSave();
  return (
    <span className="inline-flex flex-col items-center">
      <span className="inline-flex gap-1">
        <button
          type="button"
          aria-label={`طلّع ${name}`}
          disabled={first || isSaving}
          onClick={() => run(() => moveOptionAction(id, "up"))}
          className="size-9 rounded-lg border border-line-strong disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`نزّل ${name}`}
          disabled={last || isSaving}
          onClick={() => run(() => moveOptionAction(id, "down"))}
          className="size-9 rounded-lg border border-line-strong disabled:opacity-30"
        >
          ↓
        </button>
      </span>
      <ErrorText error={error} />
    </span>
  );
}

export function ColorSelect({ id, name, value }: { id: string; name: string; value: OptionColor | null }) {
  const [current, setCurrent] = useState(value ?? "");
  const { error, run } = useSave();
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label={`لون ${name}`}
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value);
          run(() => updateOptionAction(id, "color", e.target.value || null));
        }}
        className={control}
      >
        <option value="">بدون</option>
        {OPTION_COLORS.map((c) => (
          <option key={c} value={c}>
            {COLOR_LABELS[c]}
          </option>
        ))}
      </select>
      <ErrorText error={error} />
    </span>
  );
}

export function ParentSelect({
  id,
  name,
  value,
  parents,
}: {
  id: string;
  name: string;
  value: string | null;
  parents: { id: string; name: string }[];
}) {
  const [current, setCurrent] = useState(value ?? "");
  const { error, run } = useSave();
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label={`تحت شو ${name}`}
        value={current}
        onChange={(e) => {
          const before = current;
          setCurrent(e.target.value);
          run(async () => {
            const r = await updateOptionAction(id, "parent", e.target.value || null);
            if (r.status === "error") setCurrent(before);
            return r;
          });
        }}
        className={control}
      >
        <option value="">رئيسي</option>
        {parents
          .filter((p) => p.id !== id)
          .map((p) => (
            <option key={p.id} value={p.id}>
              تحت {p.name}
            </option>
          ))}
      </select>
      <ErrorText error={error} />
    </span>
  );
}

/** الأدوار المسموح إلها (فاضي = الكل). */
export function RolesPicker({ id, name, value }: { id: string; name: string; value: string[] | null }) {
  const [roles, setRoles] = useState<string[]>(value ?? []);
  const { error, run } = useSave();
  const toggle = (role: Role) => {
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    setRoles(next);
    run(() => updateOptionAction(id, "roles", next));
  };
  return (
    <details className="relative">
      <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg border border-line-strong px-2 text-sm">
        {roles.length === 0 ? "الكل" : roles.map((r) => ROLE_LABELS[r as Role] ?? r).join("، ")}
      </summary>
      <fieldset className="absolute z-10 mt-1 flex w-52 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-lg">
        <legend className="sr-only">مين بيقدر يختار {name}</legend>
        {ROLES.filter((r) => r !== "admin" && r !== "general_manager").map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roles.includes(r)}
              onChange={() => toggle(r)}
              className="accent-ink"
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
        <span className="text-[11px] text-muted">ولا واحد = الكل</span>
      </fieldset>
      <ErrorText error={error} />
    </details>
  );
}

export function DeleteOption({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { error, isSaving, run } = useSave();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`احذف ${name}`}
        className="h-9 rounded-lg border border-danger-line px-2.5 text-sm text-danger-text"
      >
        احذف
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`تحذف «${name}»؟`}>
        <p className="mb-4 text-[15px] text-muted">
          ما انستعمل ولا مرة، فبينحذف نهائياً (وبيضل بسجل التعديلات).
        </p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-danger-text">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => run(() => deleteOptionAction(id))}
            className="h-12 rounded-xl bg-danger font-semibold text-white disabled:opacity-50"
          >
            احذف
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-12 rounded-xl border border-line-strong"
          >
            لا، خليه
          </button>
        </div>
      </Dialog>
    </>
  );
}
