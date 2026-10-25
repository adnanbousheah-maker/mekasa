"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { Stepper } from "@/components/ui/Stepper";
import { batchLabel } from "@/lib/batch-label";
import { formatQuantity, formatQuantityCompact } from "@/lib/units";
import { dispatchRoundAction } from "../actions";
import { fairAllocate } from "../logic";
import type { FactoryBatchStock, RequestDoc } from "../queries";

type Qty = { wholeCakes: number; loosePieces: number };
const keyOf = (requestId: string, productId: string) => `${requestId}:${productId}`;

/** توزيع اليوم: كل طلبات الفروع مع بعض، والدفعات القديمة بتتوزع على الكل حسب الطلب. */
export function RoundForm({ requests, batches }: { requests: RequestDoc[]; batches: FactoryBatchStock[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, Qty>>(() =>
    Object.fromEntries(
      requests.flatMap((r) =>
        r.lines.map((l) => [
          keyOf(r.id, l.productId),
          { wholeCakes: l.wholeCakes, loosePieces: l.loosePieces },
        ]),
      ),
    ),
  );
  const [drivers, setDrivers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const piecesOf = (key: string, ppc: number | null) =>
    (qty[key]?.wholeCakes ?? 0) * (ppc ?? 0) + (qty[key]?.loosePieces ?? 0);

  // لكل صنف: التوزيع على كل الطلبات
  const productIds = [...new Set(requests.flatMap((r) => r.lines.map((l) => l.productId)))];
  const allocation = new Map<string, { productionDate: string; qty: number }[]>();
  const short = new Map<string, number>();
  for (const productId of productIds) {
    const ppc =
      requests.flatMap((r) => r.lines).find((l) => l.productId === productId)?.piecesPerCake ?? null;
    const productBatches = batches.filter((b) => b.productId === productId);
    const { byLine, short: missing } = fairAllocate(
      productBatches,
      requests
        .filter((r) => r.lines.some((l) => l.productId === productId))
        .map((r) => ({ key: keyOf(r.id, productId), qty: piecesOf(keyOf(r.id, productId), ppc) })),
      ppc,
    );
    byLine.forEach((v, k) => allocation.set(k, v));
    if (missing > 0) short.set(productId, missing);
  }
  const shelfOf = (productId: string) => batches.find((b) => b.productId === productId)?.shelfLifeDays ?? 7;

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const result = await dispatchRoundAction(
        requests.map((r) => ({
          requestId: r.id,
          driverName: drivers[r.id] ?? "",
          lines: r.lines.map((l) => ({
            productId: l.productId,
            requestLineId: l.lineId,
            wholeCakes: l.piecesPerCake === null ? 0 : (qty[keyOf(r.id, l.productId)]?.wholeCakes ?? 0),
            loosePieces: qty[keyOf(r.id, l.productId)]?.loosePieces ?? 0,
          })),
        })),
      );
      if (result.status === "error") setError(result.message);
      else router.replace("/factory/requests");
    });

  return (
    <>
      <p className="text-[13px] leading-relaxed text-muted">
        القديم بيتوزع على كل الفروع حسب طلبها، بدل ما أول فرع ياخذه كله. غيّر الكميات براحتك، والتوزيع بيتحدث.
      </p>
      <ul className="flex flex-col gap-3 pb-40">
        {requests.map((r) => (
          <li
            key={r.id}
            aria-label={`توزيع فرع ${r.fromName}`}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
          >
            <span className="text-[17px] font-bold">فرع {r.fromName}</span>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">اسم السائق</span>
              <input
                value={drivers[r.id] ?? ""}
                maxLength={60}
                onChange={(e) => setDrivers((d) => ({ ...d, [r.id]: e.target.value }))}
                aria-label={`اسم السائق لفرع ${r.fromName}`}
                placeholder="مثلاً: أبو محمد"
                className="h-12 rounded-xl border border-line-strong bg-surface px-3 text-base"
              />
            </label>
            {r.lines.map((l) => {
              const key = keyOf(r.id, l.productId);
              const q = qty[key] ?? { wholeCakes: 0, loosePieces: 0 };
              const set = (patch: Partial<Qty>) => setQty((all) => ({ ...all, [key]: { ...q, ...patch } }));
              const parts = allocation.get(key) ?? [];
              return (
                <div key={l.productId} className="flex flex-col gap-2 border-t border-line-soft pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <ProductName name={l.productName} className="font-semibold" />
                    <span className="text-[13px] text-muted">
                      طلبوا {formatQuantity(l.qtyPieces, l.piecesPerCake)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {l.piecesPerCake !== null && (
                      <Stepper
                        label="كيكات"
                        value={q.wholeCakes}
                        onChange={(v) => set({ wholeCakes: v })}
                        incrementLabel={`زيد كيكة ${l.productName} لـ${r.fromName}`}
                        decrementLabel={`نقّص كيكة ${l.productName} لـ${r.fromName}`}
                      />
                    )}
                    <Stepper
                      label="قطع"
                      value={q.loosePieces}
                      onChange={(v) => set({ loosePieces: v })}
                      incrementLabel={`زيد قطعة ${l.productName} لـ${r.fromName}`}
                      decrementLabel={`نقّص قطعة ${l.productName} لـ${r.fromName}`}
                    />
                  </div>
                  {parts.length > 0 && (
                    <span
                      className="text-[13px] text-muted"
                      aria-label={`دفعات ${l.productName} لـ${r.fromName}`}
                    >
                      {parts
                        .map(
                          (a) =>
                            `${batchLabel(a.productionDate, shelfOf(l.productId)).text}: ${formatQuantity(a.qty, l.piecesPerCake)}`,
                        )
                        .join(" · ")}
                    </span>
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-5 pt-3 pb-6">
          {short.size > 0 && (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger-text"
            >
              ستوك المصنع ما بيكفي:{" "}
              {[...short.entries()]
                .map(([productId, missing]) => {
                  const line = requests.flatMap((r) => r.lines).find((l) => l.productId === productId)!;
                  return `${line.productName} ناقص ${formatQuantityCompact(missing, line.piecesPerCake)}`;
                })
                .join("، ")}
            </p>
          )}
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
            disabled={isSaving || short.size > 0}
            onClick={confirm}
            className="h-14 rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : `طلّع ${requests.length === 1 ? "الطلب" : `الـ${requests.length} طلبات`}`}
          </button>
        </div>
      </div>
    </>
  );
}
