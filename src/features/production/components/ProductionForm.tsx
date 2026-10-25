"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { countWord } from "@/lib/units";
import { recordProductionAction } from "../actions";

type Product = { id: string; nameEn: string; piecesPerCake: number | null };

/** design/factory/Production: عدد لكل صنف (كيكات، أو قطع للأصناف اللي قطع بس)، كله رقم اليوم. */
export function ProductionForm({ products, dayNumber }: { products: Product[]; dayNumber: number }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const set = (id: string, v: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(999, v)) }));
  const used = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const cakes = used.filter((p) => p.piecesPerCake !== null).reduce((s, p) => s + qty[p.id], 0);
  const pieces = used.filter((p) => p.piecesPerCake === null).reduce((s, p) => s + qty[p.id], 0);

  const save = () =>
    startTransition(async () => {
      const result = await recordProductionAction({
        lines: used.map((p) =>
          p.piecesPerCake === null
            ? { productId: p.id, wholeCakes: 0, loosePieces: qty[p.id] }
            : { productId: p.id, wholeCakes: qty[p.id], loosePieces: 0 },
        ),
      });
      if (result.status === "error") setError(result.message);
      else router.replace("/factory/production?saved=1");
    });

  return (
    <>
      <ul className="flex flex-col gap-2 pb-40">
        {products.map((p) => {
          const n = qty[p.id] ?? 0;
          return (
            <li
              key={p.id}
              aria-label={p.nameEn}
              className={`flex items-center gap-3 rounded-[14px] bg-surface px-3 py-2.5 ${n > 0 ? "border-2 border-ink" : "border border-line"}`}
            >
              <div className="flex min-w-0 grow flex-col">
                <ProductName name={p.nameEn} className="text-base font-semibold" />
                <span className="text-xs text-muted">{p.piecesPerCake === null ? "قطع" : "كيكات"}</span>
              </div>
              <div className="flex h-12 w-[140px] shrink-0 items-center justify-between overflow-hidden rounded-xl border border-line-strong">
                <button
                  type="button"
                  aria-label={`زيد ${p.nameEn}`}
                  onClick={() => set(p.id, n + 1)}
                  className="flex size-12 items-center justify-center bg-quiet text-2xl"
                >
                  +
                </button>
                <span
                  role="status"
                  aria-label={`${p.nameEn}: ${n}`}
                  className="text-xl font-bold tabular-nums"
                >
                  {n}
                </span>
                <button
                  type="button"
                  aria-label={`نقّص ${p.nameEn}`}
                  disabled={n === 0}
                  onClick={() => set(p.id, n - 1)}
                  className="flex size-12 items-center justify-center bg-quiet text-2xl disabled:text-line-strong"
                >
                  −
                </button>
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
            {used.length} {used.length >= 3 && used.length <= 10 ? "أصناف" : "صنف"} · {cakes}{" "}
            {countWord(cakes, "cake")} · {pieces} {countWord(pieces, "piece")} · كلها رقم {dayNumber}
          </span>
          <button
            type="button"
            disabled={used.length === 0 || isSaving}
            onClick={save}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "حفظ الإنتاج"}
          </button>
        </div>
      </div>
    </>
  );
}
