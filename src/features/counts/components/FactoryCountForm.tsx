"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BatchBadge } from "@/components/ui/BatchBadge";
import { ProductName } from "@/components/ui/ProductName";
import { batchLabel, usesDate } from "@/lib/batch-label";
import { DAY_NAMES, dayNumberOf, recentDates } from "@/lib/day-number";
import { submitCountAction } from "../actions";
import type { CountProduct, FactoryBatch } from "../queries";

type Props = {
  products: CountProduct[];
  batches: FactoryBatch[];
  today: string;
  scheduleId: string | null;
  startedAt: string;
};

type BatchRow = { productId: string; productionDate: string; qty: number; isLastDay: boolean };

/** design/factory/FactoryCount: جرد أعمى حسب رقم الدفعة. ما بنعرض الكمية المتوقعة. */
export function FactoryCountForm({ products, batches, today, scheduleId, startedAt }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>(() =>
    batches.map((b) => ({
      productId: b.productId,
      productionDate: b.productionDate,
      qty: 0,
      isLastDay: b.isLastDay,
    })),
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  // الأصناف اللي إلها دفعات أول
  const ordered = [...products].sort(
    (a, b) => Number(rows.some((r) => r.productId === b.id)) - Number(rows.some((r) => r.productId === a.id)),
  );

  const setQty = (productId: string, date: string, qty: number) =>
    setRows((current) =>
      current.map((r) =>
        r.productId === productId && r.productionDate === date ? { ...r, qty: Math.max(0, qty) } : r,
      ),
    );

  const addBatch = (productId: string, date: string) => {
    setRows((current) => [...current, { productId, productionDate: date, qty: 0, isLastDay: false }]);
    setPicking(null);
  };

  const confirm = () =>
    startTransition(async () => {
      const byProduct = new Map(products.map((p) => [p.id, p]));
      const result = await submitCountAction({
        scheduleId,
        startedAt,
        lines: rows.map((r) => {
          const piecesOnly = byProduct.get(r.productId)?.piecesPerCake === null;
          return {
            productId: r.productId,
            productionDate: r.productionDate,
            wholeCakes: piecesOnly ? 0 : r.qty,
            loosePieces: piecesOnly ? r.qty : 0,
          };
        }),
      });
      if (result.status === "error") setError(result.message);
      else router.replace(`/count/done?id=${result.countId}`);
    });

  return (
    <>
      <ul className="flex flex-col gap-2.5 pb-36">
        {ordered.map((p) => {
          const productRows = rows
            .filter((r) => r.productId === p.id)
            .sort((a, b) => a.productionDate.localeCompare(b.productionDate));
          const byDate = usesDate(p.shelfLifeDays);
          // الأيام الممكنة لهالصنف حسب مدة حياته
          const free = recentDates(today, p.shelfLifeDays).filter(
            (d) => !productRows.some((r) => r.productionDate === d),
          );
          const total = productRows.reduce((s, r) => s + r.qty, 0);
          const unit = p.piecesPerCake === null ? "قطع" : "كيكات";
          return (
            <li
              key={p.id}
              aria-label={p.nameEn}
              className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5"
            >
              <div className="flex items-center justify-between">
                <ProductName name={p.nameEn} className="text-[17px] font-semibold" />
                <span className="text-[13px] text-muted">
                  {productRows.length > 0 ? `المجموع: ${total} ${unit}` : unit}
                </span>
              </div>
              {productRows.map((r) => {
                const day = batchLabel(r.productionDate, p.shelfLifeDays).text;
                const label = `${byDate ? "تاريخ الإنتاج" : DAY_NAMES[dayNumberOf(r.productionDate)]}${r.productionDate === today ? " (اليوم)" : ""}${r.isLastDay ? " · آخر يوم" : ""}`;
                return (
                  <div key={r.productionDate} className="flex items-center gap-2.5">
                    <BatchBadge productionDate={r.productionDate} shelfLifeDays={p.shelfLifeDays} />
                    <span className="grow text-sm text-muted">{label}</span>
                    <div className="flex h-12 w-[140px] items-center justify-between overflow-hidden rounded-xl border border-line-strong bg-surface">
                      <button
                        type="button"
                        aria-label={`زيد ${p.nameEn} ${day}`}
                        className="flex size-12 items-center justify-center bg-quiet text-[22px]"
                        onClick={() => setQty(p.id, r.productionDate, r.qty + 1)}
                      >
                        +
                      </button>
                      <span
                        role="status"
                        aria-label={`${p.nameEn} ${day}: ${r.qty}`}
                        className="text-[19px] font-bold tabular-nums"
                      >
                        {r.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`نقّص ${p.nameEn} ${day}`}
                        disabled={r.qty === 0}
                        className="flex size-12 items-center justify-center bg-quiet text-[22px] disabled:text-line-strong"
                        onClick={() => setQty(p.id, r.productionDate, r.qty - 1)}
                      >
                        −
                      </button>
                    </div>
                  </div>
                );
              })}
              {picking === p.id ? (
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={`اختار ${byDate ? "تاريخ" : "رقم"} ${p.nameEn}`}
                >
                  {free.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => addBatch(p.id, d)}
                      aria-label={batchLabel(d, p.shelfLifeDays).text}
                      className="flex h-12 items-center rounded-full border border-line-strong px-1.5"
                    >
                      <BatchBadge productionDate={d} shelfLifeDays={p.shelfLifeDays} />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPicking(null)}
                    className="h-12 px-3 text-sm text-muted"
                  >
                    رجوع
                  </button>
                </div>
              ) : (
                free.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicking(p.id)}
                    aria-label={`ضيف ${byDate ? "تاريخ" : "رقم"} لـ ${p.nameEn}`}
                    className="h-12 self-start rounded-full border border-dashed border-line-dashed px-4 text-sm text-muted"
                  >
                    {byDate
                      ? productRows.length > 0
                        ? "+ تاريخ ثاني"
                        : "+ تاريخ"
                      : productRows.length > 0
                        ? "+ رقم ثاني"
                        : "+ رقم"}
                  </button>
                )
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
          <button
            type="button"
            disabled={isSaving}
            onClick={confirm}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? "لحظة…" : "تأكيد جرد المصنع"}
          </button>
        </div>
      </div>
    </>
  );
}
