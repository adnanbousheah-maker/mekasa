"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { Stepper } from "@/components/ui/Stepper";
import { shortDate } from "@/lib/batch-label";
import { editCountAction } from "../actions";
import type { EditableCount } from "../queries";
import { MAX_COUNT_PIECES, MAX_COUNT_VALUE } from "../schemas";

type Row = { wholeCakes: number; loosePieces: number };

/** تعديل الجرد خلال ربع ساعة: نفس الأسطر، وبينبعت بس اللي تغيّر. */
export function CountEditForm({ count }: { count: EditableCount }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      count.lines.map((l) => [l.lineId, { wholeCakes: l.wholeCakes, loosePieces: l.loosePieces }]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const changed = count.lines.filter(
    (l) => rows[l.lineId].wholeCakes !== l.wholeCakes || rows[l.lineId].loosePieces !== l.loosePieces,
  );
  const set = (id: string, key: keyof Row, value: number) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], [key]: value } }));

  const save = () =>
    startTransition(async () => {
      const result = await editCountAction({
        countId: count.id,
        lines: changed.map((l) => ({ lineId: l.lineId, ...rows[l.lineId] })),
      });
      if (result.status === "error") setError(result.message);
      else router.replace(`/count/done?id=${count.id}&edited=1`);
    });

  return (
    <>
      <ul className="flex flex-col gap-2.5 pb-28">
        {count.lines.map((l) => {
          const row = rows[l.lineId];
          const label = `${l.productName}${l.productionDate ? ` ${l.frozen ? "❄ " : ""}${shortDate(l.productionDate)}` : ""}`;
          return (
            <li
              key={l.lineId}
              aria-label={label}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <ProductName name={l.productName} className="text-[17px] font-semibold" />
                {l.productionDate && (
                  <span className="text-sm text-muted">
                    {l.frozen ? "مفرّز ❄" : "دفعة"} {shortDate(l.productionDate)}
                  </span>
                )}
              </div>
              <div className={`grid gap-2.5 ${l.piecesPerCake === null ? "grid-cols-1" : "grid-cols-2"}`}>
                {l.piecesPerCake !== null && (
                  <Stepper
                    label="كيكات"
                    max={MAX_COUNT_VALUE}
                    value={row.wholeCakes}
                    onChange={(v) => set(l.lineId, "wholeCakes", v)}
                    incrementLabel={`زيد كيكة ${label}`}
                    decrementLabel={`نقّص كيكة ${label}`}
                  />
                )}
                <Stepper
                  label={l.piecesPerCake === null ? "قطع (قطع بس)" : "قطع"}
                  max={MAX_COUNT_PIECES}
                  value={row.loosePieces}
                  onChange={(v) => set(l.lineId, "loosePieces", v)}
                  incrementLabel={`زيد قطعة ${label}`}
                  decrementLabel={`نقّص قطعة ${label}`}
                />
              </div>
            </li>
          );
        })}
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
          <button
            type="button"
            disabled={isSaving || changed.length === 0}
            onClick={save}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving
              ? "لحظة…"
              : changed.length === 0
                ? "ما غيّرت شي"
                : `احفظ التعديل (${changed.length} ${changed.length === 1 ? "صنف" : "أصناف"})`}
          </button>
        </div>
      </div>
    </>
  );
}
