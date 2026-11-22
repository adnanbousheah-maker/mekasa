"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BatchBadge } from "@/components/ui/BatchBadge";
import { Dialog } from "@/components/ui/Dialog";
import { ProductName } from "@/components/ui/ProductName";
import { Stepper } from "@/components/ui/Stepper";
import { batchLabel } from "@/lib/batch-label";
import { formatQuantity, formatQuantityCompact, SAUCE_UNIT } from "@/lib/units";
import { branchSuggestionsAction, createDispatchAction } from "../actions";
import {
  asWholeCakes,
  batchKey,
  fefoAllocate,
  linesSummary,
  orderTarget,
  requestVsDispatch,
  suggestQuantity,
} from "../logic";
import type { Destination, FactoryBatchStock } from "../queries";

export interface DispatchProduct {
  id: string;
  nameEn: string;
  piecesPerCake: number | null;
  // الصوصات بتطلع من المصنع بالحبة، بدون دفعات
  kind?: "cake" | "packaging" | "sauce";
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
  // اسم السائق: من المصنع ومن مستودع التغليف
  withDriver?: boolean;
  // مواد التغليف بالحبة
  packaging?: boolean;
  // إعداد الأدمن: المصنع بيطلّع كيكات كاملة بس (بدون خانة قطع)
  cakesOnly?: boolean;
  doneHref: string;
  // إعداد: المصنع بيطلّع حتى لو الستوك ما بيكفي (الناقص من دفعة اليوم)
  allowShort?: boolean;
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
  withDriver = batches !== null,
  packaging = false,
  cakesOnly = false,
  doneHref,
  allowShort = false,
}: Props) {
  const router = useRouter();
  const byId = new Map(products.map((p) => [p.id, p]));
  const [destination, setDestination] = useState<string | null>(initialDestination);
  const whole = (l: DispatchLineInit) =>
    cakesOnly ? { ...l, ...asWholeCakes(l, byId.get(l.productId)?.piecesPerCake ?? null) } : l;
  const [lines, setLines] = useState<Line[]>(initialLines.map((l) => ({ ...whole(l), firstDate: null })));
  const [adding, setAdding] = useState(false);
  const [fefoAlert, setFefoAlert] = useState(false);
  const [driverName, setDriverName] = useState("");
  // الطلب طلع ناقص: الباقي بيطلع بدفعة ثانية اليوم (افتراضياً)، أو بيتسكّر
  const [keepOpen, setKeepOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const isFactory = batches !== null;
  const isSauce = (productId: string) => byId.get(productId)?.kind === "sauce";
  // الكيك بالمصنع بس إله دفعات
  const hasBatches = (l: Line) => isFactory && !isSauce(l.productId);

  const pieces = (l: Line) => l.wholeCakes * (byId.get(l.productId)?.piecesPerCake ?? 0) + l.loosePieces;
  const batchesOf = (productId: string) =>
    (batches ?? [])
      .filter((b) => b.productId === productId)
      .map((b) => ({
        key: batchKey(b),
        productionDate: b.productionDate,
        frozen: b.frozen,
        expiresOn: b.expiresOn,
        available: b.available,
        expired: b.expired,
        dayNumber: b.dayNumber,
        // رقم اليوم، أو التاريخ للأصناف اللي بتعيش أكثر من أسبوع، و❄ للمفرّز
        label: batchLabel(b.productionDate, b.shelfLifeDays, b.frozen).text,
        shelfLifeDays: b.shelfLifeDays,
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
              orderTarget(s.avgPieces, s.parPieces, s.minTomorrow, p?.piecesPerCake ?? null),
              s.stockPieces,
              p?.piecesPerCake ?? null,
            );
            return {
              ...whole({
                productId: s.productId,
                requestLineId: null,
                requestedPieces: null,
                wholeCakes: q.wholeCakes,
                loosePieces: q.loosePieces,
              }),
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
        closeRequest: !!requestId && sentLess && !keepOpen,
        lines: send.map((l) => ({
          productId: l.productId,
          wholeCakes: byId.get(l.productId)?.piecesPerCake === null ? 0 : l.wholeCakes,
          loosePieces: l.loosePieces,
          requestLineId: l.requestLineId,
          batches:
            hasBatches(l) && l.firstDate
              ? allocationOf(l).allocations.map((a) => ({
                  productionDate: a.productionDate,
                  frozen: a.frozen ?? false,
                  qty: a.qty,
                }))
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
    if (lines.some((l) => hasBatches(l) && pieces(l) > 0 && allocationOf(l).override)) setFefoAlert(true);
    else submit(false);
  };

  const overridden = lines.find((l) => hasBatches(l) && pieces(l) > 0 && allocationOf(l).override);
  const overriddenOldest = overridden
    ? fefoAllocate(batchesOf(overridden.productId), pieces(overridden)).allocations[0]
    : null;
  const shortLines = lines.filter((l) => hasBatches(l) && pieces(l) > 0 && allocationOf(l).short > 0);
  // الستوك ناقص بس الإعداد بيسمح: بيطلع، والناقص من دفعة اليوم
  const blockingShort = allowShort ? [] : shortLines;
  // أقل من الطلب: في باقي ممكن يطلع بدفعة ثانية
  const sentLess = initialLines.some(
    (i) =>
      i.requestLineId !== null &&
      (i.requestedPieces ?? 0) >
        (lines.find((l) => l.requestLineId === i.requestLineId)
          ? pieces(lines.find((l) => l.requestLineId === i.requestLineId)!)
          : 0),
  );
  const sauceUnits = lines.filter((l) => isSauce(l.productId)).reduce((n, l) => n + l.loosePieces, 0);
  const cakeLines = lines.filter((l) => !isSauce(l.productId));
  const summary = [
    cakeLines.some((l) => pieces(l) > 0) || sauceUnits === 0 ? linesSummary(cakeLines, packaging) : "",
    sauceUnits > 0 ? `${sauceUnits} ${SAUCE_UNIT} صوص` : "",
  ]
    .filter(Boolean)
    .join(" · ");
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
      {withDriver && (
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
          const byUnit = packaging || p.kind === "sauce";
          const qty = pieces(l);
          const tag = requestVsDispatch(
            l.requestedPieces === null ? (requestId ? 0 : null) : l.requestedPieces,
            qty,
          );
          const stock = batchesOf(l.productId).filter((b) => !b.expired);
          const allocation = allocationOf(l);
          const defaultFirst = stock[0]?.key ?? null;
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
                  طلبوا:{" "}
                  {byUnit
                    ? `${l.requestedPieces} ${p.kind === "sauce" ? SAUCE_UNIT : "حبة"}`
                    : formatQuantity(l.requestedPieces, p.piecesPerCake)}
                </span>
              )}
              <div
                className={`grid gap-2.5 ${p.piecesPerCake === null || cakesOnly ? "grid-cols-1" : "grid-cols-2"}`}
              >
                {p.piecesPerCake !== null && (
                  <Stepper
                    label="كيكات"
                    value={l.wholeCakes}
                    onChange={(v) => update(l.productId, { wholeCakes: v })}
                    incrementLabel={`زيد كيكة ${p.nameEn}`}
                    decrementLabel={`نقّص كيكة ${p.nameEn}`}
                  />
                )}
                {(p.piecesPerCake === null || !cakesOnly) && (
                  <Stepper
                    label={byUnit ? (p.kind === "sauce" ? SAUCE_UNIT : "حبات") : "قطع"}
                    typed={byUnit}
                    value={l.loosePieces}
                    onChange={(v) => update(l.productId, { loosePieces: v })}
                    incrementLabel={`زيد قطعة ${p.nameEn}`}
                    decrementLabel={`نقّص قطعة ${p.nameEn}`}
                  />
                )}
              </div>
              {hasBatches(l) &&
                (stock.length === 0 ? (
                  <span className="text-[13px] font-semibold text-danger-text">
                    ما في ستوك من هالصنف بالمصنع
                  </span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] text-muted">الدفعات بالمصنع (اكبس لتختار)</span>
                    <div className="flex flex-wrap gap-2">
                      {stock.map((b) => {
                        const active = (l.firstDate ?? defaultFirst) === b.key;
                        return (
                          <button
                            key={b.key}
                            type="button"
                            aria-pressed={active}
                            aria-label={`ابدأ من ${b.label} (${formatQuantityCompact(b.available, p.piecesPerCake)})`}
                            onClick={() =>
                              update(l.productId, {
                                firstDate: b.key === defaultFirst ? null : b.key,
                              })
                            }
                            className={`flex h-12 items-center gap-1.5 rounded-full px-2 ${active ? "border-2 border-ink bg-quiet" : "border border-line-strong"}`}
                          >
                            <BatchBadge
                              productionDate={b.productionDate}
                              shelfLifeDays={b.shelfLifeDays}
                              frozen={b.frozen}
                            />
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
                              `${batchesOf(l.productId).find((b) => b.key === batchKey(a))?.label}: ${formatQuantityCompact(a.qty, p.piecesPerCake)}`,
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
          {shortLines.length > 0 &&
            (allowShort ? (
              <span className="text-center text-sm font-semibold text-warn-text">
                ستوك {shortLines.map((l) => byId.get(l.productId)?.nameEn).join("، ")} ما بيكفي. الناقص بيطلع
                على دفعة اليوم
              </span>
            ) : (
              <span className="text-center text-sm font-semibold text-danger-text">
                ستوك المصنع ما بيكفي لـ {shortLines.map((l) => byId.get(l.productId)?.nameEn).join("، ")}
              </span>
            ))}
          {requestId && sentLess && (
            <label className="flex min-h-12 items-center gap-3 rounded-xl bg-quiet px-3 py-2">
              <input
                type="checkbox"
                checked={keepOpen}
                onChange={(e) => setKeepOpen(e.target.checked)}
                className="size-6 shrink-0"
              />
              <span className="text-[15px]">الباقي من الطلب رح يطلع بدفعة ثانية اليوم</span>
            </label>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger-text"
            >
              {error}
            </p>
          )}
          <span className="text-center text-sm text-muted">{summary}</span>
          <button
            type="button"
            disabled={
              !destination || isSaving || blockingShort.length > 0 || lines.every((l) => pieces(l) === 0)
            }
            onClick={confirm}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : isFactory || withDriver ? "تأكيد الإخراج" : "تأكيد التحويل"}
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
              ? `${byId.get(overridden.productId)?.nameEn}: في دفعة ${batchesOf(overridden.productId).find((b) => b.key === batchKey(overriddenOldest))?.label} أقدم ولسا فيها ستوك. لازم تطلع الأقدم أول.`
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
