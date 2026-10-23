"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { Stepper } from "@/components/ui/Stepper";
import { submitCountAction } from "../actions";
import type { CountProduct } from "../queries";
import { countTotals, type CountLine } from "../schemas";

export type PrefilledLine = {
  wholeCakes: number;
  loosePieces: number;
  // الجرد بالصورة: الرقم مش أكيد (برتقالي لحد ما الموظف يلمسه)
  unsure?: boolean;
  ocr?: CountLine["ocr"];
};

type Props = {
  products: CountProduct[];
  scheduleId: string | null;
  startedAt: string;
  initial?: Record<string, PrefilledLine>;
  photo?: { path: string; formVersionId: string | null };
};

type Row = { wholeCakes: number; loosePieces: number; unsure: boolean };

/** design/branch/CountConfirm: كيكات وقطع لكل صنف، وتأكيد بأسفل الشاشة. */
export function BranchCountForm({ products, scheduleId, startedAt, initial = {}, photo }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      products.map((p) => {
        const pre = initial[p.id];
        return [
          p.id,
          { wholeCakes: pre?.wholeCakes ?? 0, loosePieces: pre?.loosePieces ?? 0, unsure: !!pre?.unsure },
        ];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const update = (id: string, key: "wholeCakes" | "loosePieces", value: number) =>
    setRows((current) => ({ ...current, [id]: { ...current[id], [key]: value, unsure: false } }));

  const unsureCount = Object.values(rows).filter((r) => r.unsure).length;
  const totals = countTotals(Object.values(rows));

  const confirm = () =>
    startTransition(async () => {
      const result = await submitCountAction({
        scheduleId,
        startedAt,
        method: photo ? "photo" : "manual",
        photoPath: photo?.path ?? null,
        formVersionId: photo?.formVersionId ?? null,
        lines: products.map((p) => ({
          productId: p.id,
          wholeCakes: p.piecesPerCake === null ? 0 : rows[p.id].wholeCakes,
          loosePieces: rows[p.id].loosePieces,
          ocr: initial[p.id]?.ocr,
        })),
      });
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.replace(`/count/done?id=${result.countId}`);
      }
    });

  return (
    <>
      {unsureCount > 0 && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2.5"
        >
          <span aria-hidden="true" className="text-warn">
            ⚠
          </span>
          <span className="text-[15px] text-warn-text">
            <strong>
              {unsureCount === 1 ? "رقم واحد" : unsureCount === 2 ? "رقمين" : `${unsureCount} أرقام`}
            </strong>{" "}
            مش واضحين بالصورة، تأكد منهم
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-2.5 pb-40">
        {products.map((p) => {
          const row = rows[p.id];
          return (
            <li
              key={p.id}
              aria-label={p.nameEn}
              className={`flex flex-col gap-2.5 rounded-2xl bg-surface p-3 ${row.unsure ? "border-2 border-warn-edge" : "border border-line"}`}
            >
              <div className="flex items-center gap-3">
                <ProductName name={p.nameEn} className="grow text-[17px] font-semibold" />
                {row.unsure && (
                  <span className="rounded-[10px] bg-warn-chip px-2.5 py-0.5 text-xs font-semibold text-warn-text">
                    تأكد
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {p.piecesPerCake === null ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] text-muted">كيكات</span>
                    <div className="flex h-12 items-center justify-center rounded-xl bg-quiet text-[13px] text-muted">
                      قطع بس
                    </div>
                  </div>
                ) : (
                  <Stepper
                    label="كيكات"
                    value={row.wholeCakes}
                    onChange={(v) => update(p.id, "wholeCakes", v)}
                    incrementLabel={`زيد كيكة ${p.nameEn}`}
                    decrementLabel={`نقّص كيكة ${p.nameEn}`}
                  />
                )}
                <Stepper
                  label="قطع"
                  value={row.loosePieces}
                  onChange={(v) => update(p.id, "loosePieces", v)}
                  incrementLabel={`زيد قطعة ${p.nameEn}`}
                  decrementLabel={`نقّص قطعة ${p.nameEn}`}
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
          <span className="text-center text-sm text-muted">
            {products.length} صنف · {totals.cakes} كيكة · {totals.pieces} قطعة
          </span>
          <button
            type="button"
            disabled={isSaving}
            onClick={confirm}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? "لحظة…" : "تأكيد الجرد"}
          </button>
        </div>
      </div>
    </>
  );
}
