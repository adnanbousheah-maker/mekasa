"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DayBadge } from "@/components/ui/DayBadge";
import { Dialog } from "@/components/ui/Dialog";
import { ProductName } from "@/components/ui/ProductName";
import { Stepper } from "@/components/ui/Stepper";
import type { DayNumber } from "@/lib/day-number";
import { formatQuantity, formatQuantityCompact } from "@/lib/units";
import { branchSuggestionsAction, createDispatchAction } from "../actions";
import { fefoAllocate, linesSummary, orderTarget, requestVsDispatch, suggestQuantity } from "../logic";
import type { Destination, FactoryBatchStock } from "../queries";

export interface DispatchProduct {
  id: string;
  nameEn: string;
  piecesPerCake: number | null;
}

export interface DispatchLineInit {
  productId: string;
  requestLineId: string | null;
  requestedPieces: number | null;
  wholeCakes: number;
  loosePieces: number;
}

type Props = {
  products: DispatchProduct[];
  destinations: Destination[];
  initialDestination: string | null;
  requestId: string | null;
  initialLines: DispatchLineInit[];
  // المصنع بس: الدفعات اللي إلها ستوك
  batches: FactoryBatchStock[] | null;
  doneHref: string;
};

type Line = DispatchLineInit & { firstDate: string | null };

/** design/factory/Dispatch: الكميات من الطلب، الدفعات بأرقام الأيام، والأقدم أول. */
export function DispatchForm({
  products,
  destinations,
  initialDestination,
  requestId,
  initialLines,
  batches,
  doneHref,
}: Props) {
  const router = useRouter();
  const byId = new Map(products.map((p) => [p.id, p]));
  const [destination, setDestination] = useState<string | null>(initialDestination);
  const [lines, setLines] = useState<Line[]>(initialLines.map((l) => ({ ...l, firstDate: null })));
  const [adding, setAdding] = useState(false);
  const [fefoAlert, setFefoAlert] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const isFactory = batches !== null;

  const pieces = (l: Line) => l.wholeCakes * (byId.get(l.productId)?.piecesPerCake ?? 0) + l.loosePieces;
  const batchesOf = (productId: string) =>
    (batches ?? [])
      .filter((b) => b.productId === productId)
      .map((b) => ({
        productionDate: b.productionDate,
        available: b.available,
        expired: b.expired,
        dayNumber: b.dayNumber,
        lastDay: b.lastDay,
      }));
  const allocationOf = (l: Line) => fefoAllocate(batchesOf(l.productId), pieces(l), l.firstDate);
  const update = (productId: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const pickDestination = (id: string) =>
    startTransition(async () => {
      setDestination(id);
      if (requestId) return;
      // بدون طلب: الكميات المقترحة حسب استهلاك الفرع (أو الحد المطلوب)
      const suggestions =
        destinations.find((d) => d.id === id)?.kind === "branch" ? await branchSuggestionsAction(id) : [];
      setLines(
        suggestions
          .map((s) => {
            const p = byId.get(s.productId);
            const q = suggestQuantity(
              orderTarget(s.avgPieces, s.parPieces),
              s.stockPieces,
              p?.piecesPerCake ?? null,
            );
            return {
              productId: s.productId,
              requestLineId: null,
              requestedPieces: null,
              wholeCakes: q.wholeCakes,
              loosePieces: q.loosePieces,
              firstDate: null,
            };
          })
          .filter((l) => byId.has(l.productId) && l.wholeCakes + l.loosePieces > 0),
      );
    });

  const submit = (confirmOverride: boolean, useOldest = false) =>
    startTransition(async () => {
      setError(null);
      const send = useOldest ? lines.map((l) => ({ ...l, firstDate: null })) : lines;
      if (useOldest) setLines(send);
      const result = await createDispatchAction({
        toLocationId: destination ?? "",
        requestId,
        confirmFefoOverride: confirmOverride,
        driverName,
        lines: send.map((l) => ({
          productId: l.productId,
          wholeCakes: byId.get(l.productId)?.piecesPerCake === null ? 0 : l.wholeCakes,
          loosePieces: l.loosePieces,
          requestLineId: l.requestLineId,
          batches:
            isFactory && l.firstDate
              ? allocationOf(l).allocations.map((a) => ({ productionDate: a.productionDate, qty: a.qty }))
              : undefined,
        })),
      });
      if (result.status === "error") {
        if (result.fefoOverride) setFefoAlert(true);
        else setError(result.message);
        return;
      }
      setFefoAlert(false);
      router.replace(doneHref);
    });

  const confirm = () => {
    if (isFactory && lines.some((l) => pieces(l) > 0 && allocationOf(l).override)) setFefoAlert(true);
    else submit(false);
  };

  const overridden = lines.find((l) => pieces(l) > 0 && allocationOf(l).override);
  const overriddenOldest = overridden
    ? fefoAllocate(batchesOf(overridden.productId), pieces(overridden)).allocations[0]
    : null;
  const shortLines = isFactory ? lines.filter((l) => pieces(l) > 0 && allocationOf(l).short > 0) : [];
  const notAdded = products.filter((p) => !lines.some((l) => l.productId === p.id));

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-muted">الوجهة</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الوجهة">
          {destinations.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={destination === d.id}
              disabled={!!requestId && d.id !== initialDestination}
              onClick={() => pickDestination(d.id)}
              className={`h-12 rounded-xl px-4 text-base disabled:opacity-40 ${destination === d.id ? "border-2 border-ink bg-quiet font-semibold" : "border border-line-strong bg-surface"}`}
            >
              {d.kind === "branch" ? `فرع ${d.name}` : d.name}
            </button>
          ))}
        </div>
      </fieldset>
      {isFactory && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted">اسم السائق</span>
          <input
            value={driverName}
            maxLength={60}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="مثلاً: أبو محمد"
            className="h-12 rounded-xl border border-line-strong bg-surface px-3 text-base"
          />
        </label>
      )}
      <p className="text-[13px] leading-relaxed text-muted">
        {requestId ? "الكميات معبّاية من الطلب. غيّر براحتك" : "الكميات مقترحة حسب الحد المطلوب. غيّر براحتك"}
        {isFactory ? "، والنظام بيطلّع من الدفعة الأقدم أول." : "."}
      </p>

      <ul className="flex flex-col gap-2.5 pb-44">
        {lines.map((l) => {
          const p = byId.get(l.productId);
          if (!p) return null;
          const qty = pieces(l);
          const tag = requestVsDispatch(
            l.requestedPieces === null ? (requestId ? 0 : null) : l.requestedPieces,
            qty,
          );
          const stock = batchesOf(l.productId).filter((b) => !b.expired);
          const allocation = allocationOf(l);
          const defaultFirst = stock[0]?.productionDate ?? null;
          return (
            <li
              key={l.productId}
              aria-label={p.nameEn}
              className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <ProductName name={p.nameEn} className="text-[17px] font-semibold" />
                {tag && requestId && (
                  <span className="rounded-[10px] bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-info-text">
                    {tag}
                  </span>
                )}
              </div>
              {l.requestedPieces !== null && (
                <span className="text-[13px] text-muted">
                  طلبوا: {formatQuantity(l.requestedPieces, p.piecesPerCake)}
                </span>
              )}
              <div className={`grid gap-2.5 ${p.piecesPerCake === null ? "grid-cols-1" : "grid-cols-2"}`}>
                {p.piecesPerCake !== null && (
                  <Stepper
                    label="كيكات"
                    value={l.wholeCakes}
                    onChange={(v) => update(l.productId, { wholeCakes: v })}
                    incrementLabel={`زيد كيكة ${p.nameEn}`}
                    decrementLabel={`نقّص كيكة ${p.nameEn}`}
                  />
                )}
                <Stepper
                  label="قطع"
                  value={l.loosePieces}
                  onChange={(v) => update(l.productId, { loosePieces: v })}
                  incrementLabel={`زيد قطعة ${p.nameEn}`}
                  decrementLabel={`نقّص قطعة ${p.nameEn}`}
                />
              </div>
              {isFactory &&
                (stock.length === 0 ? (
                  <span className="text-[13px] font-semibold text-danger-text">
                    ما في ستوك من هالصنف بالمصنع
                  </span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] text-muted">الدفعات بالمصنع (اكبس لتختار)</span>
                    <div className="flex flex-wrap gap-2">
                      {stock.map((b) => {
                        const active = (l.firstDate ?? defaultFirst) === b.productionDate;
                        return (
                          <button
                            key={b.productionDate}
                            type="button"
                            aria-pressed={active}
                            aria-label={`ابدأ من رقم ${b.dayNumber} (${formatQuantityCompact(b.available, p.piecesPerCake)})`}
                            onClick={() =>
                              update(l.productId, {
                                firstDate: b.productionDate === defaultFirst ? null : b.productionDate,
                              })
                            }
                            className={`flex h-12 items-center gap-1.5 rounded-full px-2 ${active ? "border-2 border-ink bg-quiet" : "border border-line-strong"}`}
                          >
                            <DayBadge day={b.dayNumber as DayNumber} />
                            <span className="text-sm tabular-nums">
                              {formatQuantityCompact(b.available, p.piecesPerCake)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {qty > 0 && (
                      <span
                        className={`text-[13px] ${allocation.short > 0 ? "font-semibold text-danger-text" : "text-muted"}`}
                      >
                        {allocation.allocations
                          .map(
                            (a) =>
                              `رقم ${batchesOf(l.productId).find((b) => b.productionDate === a.productionDate)?.dayNumber}: ${formatQuantityCompact(a.qty, p.piecesPerCake)}`,
                          )
                          .join(" · ")}
                        {allocation.short > 0 &&
                          ` · ناقص ${formatQuantityCompact(allocation.short, p.piecesPerCake)}`}
                      </span>
                    )}
                  </div>
                ))}
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-12 w-full rounded-xl border border-dashed border-line-dashed text-[15px] text-muted"
          >
            + أضف صنف {requestId ? "ما انطلب" : ""}
          </button>
        </li>
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-5 pt-3 pb-6">
          {shortLines.length > 0 && (
            <span className="text-center text-sm font-semibold text-danger-text">
              ستوك المصنع ما بيكفي لـ {shortLines.map((l) => byId.get(l.productId)?.nameEn).join("، ")}
            </span>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger-text"
            >
              {error}
            </p>
          )}
          <span className="text-center text-sm text-muted">{linesSummary(lines)}</span>
          <button
            type="button"
            disabled={
              !destination || isSaving || shortLines.length > 0 || lines.every((l) => pieces(l) === 0)
            }
            onClick={confirm}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : isFactory ? "تأكيد الإخراج" : "تأكيد التحويل"}
          </button>
        </div>
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="أضف صنف">
        <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
          {notAdded.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setLines((ls) => [
                    ...ls,
                    {
                      productId: p.id,
                      requestLineId: null,
                      requestedPieces: requestId ? 0 : null,
                      wholeCakes: 0,
                      loosePieces: 0,
                      firstDate: null,
                    },
                  ]);
                  setAdding(false);
                }}
                className="flex h-12 w-full items-center rounded-xl px-3 hover:bg-quiet"
              >
                <ProductName name={p.nameEn} />
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog open={fefoAlert} onClose={() => setFefoAlert(false)} title="في دفعة أقدم!">
        <div role="alert" className="mb-5 flex flex-col gap-2 text-[15px]">
          <p>
            {overridden && overriddenOldest
              ? `${byId.get(overridden.productId)?.nameEn}: في دفعة رقم ${batchesOf(overridden.productId).find((b) => b.productionDate === overriddenOldest.productionDate)?.dayNumber} أقدم ولسا فيها ستوك. لازم تطلع الأقدم أول.`
              : "في دفعة أقدم لسا فيها ستوك. لازم تطلع الأقدم أول."}
          </p>
          <p className="text-sm text-muted">إذا كمّلت من الأحدث، بينسجل إنك تجاوزت.</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => submit(false, true)}
            className="h-14 rounded-[14px] bg-ink text-lg font-semibold text-white"
          >
            طلّع من الأقدم
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => submit(true)}
            className="h-12 rounded-xl border border-danger-line text-danger-text"
          >
            كمّل من الدفعة اللي اخترتها (بينسجل)
          </button>
        </div>
      </Dialog>
    </>
  );
}
