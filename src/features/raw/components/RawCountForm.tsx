"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitRawCountAction } from "../actions";
import type { RawMaterialRow } from "../queries";

type Row = { qty: string; unitId: string | null };

/** جرد المواد الأولية: اكتب الموجود لكل مادة (بأي وحدة). الفاضي ما بينعد. */
export function RawCountForm({ materials, startedAt }: { materials: RawMaterialRow[]; startedAt: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(materials.map((m) => [m.id, { qty: "", unitId: null }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const parse = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
  const filled = materials.filter(
    (m) => rows[m.id].qty.trim() !== "" && Number.isFinite(parse(rows[m.id].qty)),
  );

  const submit = () =>
    startTransition(async () => {
      const result = await submitRawCountAction({
        startedAt,
        lines: filled.map((m) => ({
          materialId: m.id,
          unitId: rows[m.id].unitId,
          qty: parse(rows[m.id].qty),
        })),
      });
      if (result.status === "error") setError(result.message);
      else router.replace("/factory/raw?counted=1");
    });

  return (
    <>
      <ul className="flex flex-col gap-2.5 pb-36">
        {materials.map((m) => (
          <li
            key={m.id}
            aria-label={m.name}
            className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-3"
          >
            <span className="grow text-base font-semibold">{m.name}</span>
            <input
              inputMode="decimal"
              aria-label={`كمية ${m.name}`}
              value={rows[m.id].qty}
              onChange={(e) => setRows((r) => ({ ...r, [m.id]: { ...r[m.id], qty: e.target.value } }))}
              className="h-12 w-24 rounded-xl border border-line-strong text-center text-lg font-bold"
            />
            <select
              aria-label={`وحدة ${m.name}`}
              value={rows[m.id].unitId ?? ""}
              onChange={(e) =>
                setRows((r) => ({ ...r, [m.id]: { ...r[m.id], unitId: e.target.value || null } }))
              }
              className="h-12 rounded-xl border border-line-strong bg-surface px-2"
            >
              <option value="">{m.baseUnit}</option>
              {m.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-5 pt-3 pb-6">
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger-text"
            >
              {error}
            </p>
          )}
          <span className="text-center text-sm text-muted">
            انعدّ {filled.length} من {materials.length}
          </span>
          <button
            type="button"
            disabled={isSaving || filled.length === 0}
            onClick={submit}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "تأكيد جرد المواد"}
          </button>
        </div>
      </div>
    </>
  );
}
