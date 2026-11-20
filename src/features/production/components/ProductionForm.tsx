"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { NumberField } from "@/components/ui/Stepper";
import { countPhrase } from "@/lib/units";
import { recordProductionAction } from "../actions";
import { splitFrozen } from "../logic";

type Product = { id: string; nameEn: string; piecesPerCake: number | null };

/**
 * design/factory/Production: عدد لكل صنف (كيكات، أو قطع للأصناف اللي قطع بس)، كله رقم اليوم.
 * "منها مفرّز": جزء (أو كل) الكمية بيصير دفعة مفرّزة صلاحيتها 30 يوم.
 */
export function ProductionForm({ products, dayNumber }: { products: Product[]; dayNumber: number }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [frozen, setFrozen] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const set = (id: string, v: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(999, v)) }));
  const setFrozenOf = (id: string, v: number) => setFrozen((f) => ({ ...f, [id]: Math.max(0, v) }));
  const used = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const frozenTotal = used.reduce((s, p) => s + splitFrozen(qty[p.id], frozen[p.id] ?? 0).frozen, 0);
  const cakes = used.filter((p) => p.piecesPerCake !== null).reduce((s, p) => s + qty[p.id], 0);
  const pieces = used.filter((p) => p.piecesPerCake === null).reduce((s, p) => s + qty[p.id], 0);

  const save = () =>
    startTransition(async () => {
      const result = await recordProductionAction({
        lines: used.flatMap((p) => {
          const parts = splitFrozen(qty[p.id], frozen[p.id] ?? 0);
          const line = (n: number, isFrozen: boolean) =>
            p.piecesPerCake === null
              ? { productId: p.id, wholeCakes: 0, loosePieces: n, frozen: isFrozen }
              : { productId: p.id, wholeCakes: n, loosePieces: 0, frozen: isFrozen };
          return [
            ...(parts.fresh > 0 ? [line(parts.fresh, false)] : []),
            ...(parts.frozen > 0 ? [line(parts.frozen, true)] : []),
          ];
        }),
      });
      if (result.status === "error") setError(result.message);
      else router.replace("/factory/production?saved=1");
    });

  return (
    <>
      <ul className="flex flex-col gap-2 pb-40">
        {products.map((p) => {
          const n = qty[p.id] ?? 0;
          const f = splitFrozen(n, frozen[p.id] ?? 0).frozen;
          return (
            <li
              key={p.id}
              aria-label={p.nameEn}
              className={`flex flex-col gap-2 rounded-[14px] bg-surface px-3 py-2.5 ${n > 0 ? "border-2 border-ink" : "border border-line"}`}
            >
              <div className="flex items-center gap-3">
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
                  <NumberField
                    label={p.nameEn}
                    value={n}
                    onChange={(next) => set(p.id, next)}
                    className="text-xl"
                  />
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
              </div>
              {n > 0 && (
                <div className="flex items-center gap-2 border-t border-line pt-2">
                  <span className="grow text-sm">
                    ❄ منها مفرّز <span className="text-xs text-muted">(صلاحية شهر)</span>
                  </span>
                  <button
                    type="button"
                    aria-pressed={f === n}
                    onClick={() => setFrozenOf(p.id, f === n ? 0 : n)}
                    className={`h-12 rounded-xl px-3 text-sm font-semibold ${f === n ? "bg-ink text-white" : "border border-line-strong"}`}
                  >
                    كلها
                  </button>
                  <div className="flex h-12 w-[88px] items-center overflow-hidden rounded-xl border border-line-strong">
                    <NumberField
                      label={`مفرّز ${p.nameEn}`}
                      value={f}
                      onChange={(next) => setFrozenOf(p.id, Math.min(n, next))}
                      className="text-lg"
                    />
                  </div>
                </div>
              )}
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
            {used.length} {used.length >= 3 && used.length <= 10 ? "أصناف" : "صنف"} ·{" "}
            {countPhrase(cakes, "cake")} · {countPhrase(pieces, "piece")} ·{" "}
            {frozenTotal > 0
              ? `منها ${frozenTotal} مفرّز ❄ · الطازة رقم ${dayNumber}`
              : `كلها رقم ${dayNumber}`}
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
