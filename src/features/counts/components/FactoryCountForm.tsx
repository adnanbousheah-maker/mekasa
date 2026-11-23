"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BatchBadge } from "@/components/ui/BatchBadge";
import { Dialog } from "@/components/ui/Dialog";
import { NumberField } from "@/components/ui/Stepper";
import { ProductName } from "@/components/ui/ProductName";
import { batchLabel, usesDate } from "@/lib/batch-label";
import { DAY_NAMES, dayNumberOf, recentDates } from "@/lib/day-number";
import { submitCountAction } from "../actions";
import { useCountDraft } from "../draft";
import { DraftNotice } from "./DraftNotice";
import type { CountProduct, FactoryBatch } from "../queries";
import { MAX_COUNT_PIECES, MAX_COUNT_VALUE } from "../schemas";

type Props = {
  products: CountProduct[];
  batches: FactoryBatch[];
  today: string;
  scheduleId: string | null;
  startedAt: string;
};

type BatchRow = {
  productId: string;
  productionDate: string;
  frozen: boolean;
  qty: number;
  isLastDay: boolean;
};

// المفرّز صلاحيته 30 يوم (نفس private.frozen_shelf_life)
const FROZEN_DAYS = 30;
const keyOf = (r: { productionDate: string; frozen: boolean }) =>
  r.frozen ? `${r.productionDate}|f` : r.productionDate;

/**
 * design/factory/FactoryCount: جرد أعمى حسب رقم الدفعة. ما بنعرض الكمية المتوقعة.
 * المفرّز سطر لحاله (❄ والتاريخ) جنب دفعات نفس الصنف.
 */
export function FactoryCountForm({ products, batches, today, scheduleId, startedAt }: Props) {
  const router = useRouter();
  const blankRows = (): BatchRow[] =>
    batches.map((b) => ({
      productId: b.productId,
      productionDate: b.productionDate,
      frozen: b.frozen,
      qty: 0,
      isLastDay: b.isLastDay,
    }));
  const [rows, setRows] = useState<BatchRow[]>(blankRows);
  // الأرقام بتنحفظ بالجوال: الدفعات الموجودة بتاخذ رقمها، واللي الموظف ضافها بترجع
  const draft = useCountDraft(
    "factory",
    rows,
    (saved) =>
      setRows((current) => {
        const known = new Set(products.map((p) => p.id));
        const merged = current.map((r) => {
          const s = saved.find((x) => x.productId === r.productId && keyOf(x) === keyOf(r));
          return s ? { ...r, qty: s.qty } : r;
        });
        const added = saved.filter(
          (s) =>
            known.has(s.productId) &&
            !current.some((r) => r.productId === s.productId && keyOf(r) === keyOf(s)),
        );
        return [...merged, ...added];
      }),
    startedAt,
  );
  const [picking, setPicking] = useState<string | null>(null);
  // إضافة دفعة مفرّزة: الصنف وتاريخ الإنتاج
  const [freezing, setFreezing] = useState<{ productId: string; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askMissing, setAskMissing] = useState(false);
  const [isSaving, startTransition] = useTransition();

  // الدفعات اللي إلها ستوك وانتركت صفر: الجرد كامل، فرح تنحسب صفر (23 نوفمبر: جرد انعدّ فيه صنف واحد صفّر المصنع)
  const known = new Set(batches.map((b) => `${b.productId}:${keyOf(b)}`));
  const notCounted = rows.filter((r) => r.qty === 0 && known.has(`${r.productId}:${keyOf(r)}`));
  const productOf = new Map(products.map((p) => [p.id, p]));

  // الأصناف اللي إلها دفعات أول
  const ordered = [...products].sort(
    (a, b) => Number(rows.some((r) => r.productId === b.id)) - Number(rows.some((r) => r.productId === a.id)),
  );

  const setQty = (productId: string, key: string, qty: number) =>
    setRows((current) =>
      current.map((r) =>
        r.productId === productId && keyOf(r) === key ? { ...r, qty: Math.max(0, qty) } : r,
      ),
    );

  const addBatch = (productId: string, date: string, frozen = false) => {
    setRows((current) =>
      current.some((r) => r.productId === productId && keyOf(r) === keyOf({ productionDate: date, frozen }))
        ? current
        : [...current, { productId, productionDate: date, frozen, qty: 0, isLastDay: false }],
    );
    setPicking(null);
    setFreezing(null);
  };
  const oldestFrozen = recentDates(today, FROZEN_DAYS).at(-1)!;

  const confirm = () => {
    if (notCounted.length > 0 && !askMissing) {
      setAskMissing(true);
      return;
    }
    save();
  };

  const save = () =>
    startTransition(async () => {
      const byProduct = new Map(products.map((p) => [p.id, p]));
      const result = await submitCountAction({
        scheduleId,
        startedAt: draft.startedAt,
        lines: rows.map((r) => {
          const piecesOnly = byProduct.get(r.productId)?.piecesPerCake === null;
          return {
            productId: r.productId,
            productionDate: r.productionDate,
            frozen: r.frozen,
            wholeCakes: piecesOnly ? 0 : r.qty,
            loosePieces: piecesOnly ? r.qty : 0,
          };
        }),
      });
      if (result.status === "error") setError(result.message);
      else {
        draft.clear();
        router.replace(`/count/done?id=${result.countId}`);
      }
    });

  return (
    <>
      {draft.restored && (
        <DraftNotice
          onDiscard={() => {
            draft.discard();
            setRows(blankRows());
          }}
        />
      )}
      <ul className="flex flex-col gap-2.5 pb-36">
        {ordered.map((p) => {
          const productRows = rows
            .filter((r) => r.productId === p.id)
            .sort(
              (a, b) =>
                Number(a.frozen) - Number(b.frozen) || a.productionDate.localeCompare(b.productionDate),
            );
          const byDate = usesDate(p.shelfLifeDays);
          // الأيام الممكنة لهالصنف حسب مدة حياته
          const free = recentDates(today, p.shelfLifeDays).filter(
            (d) => !productRows.some((r) => !r.frozen && r.productionDate === d),
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
                const day = batchLabel(r.productionDate, p.shelfLifeDays, r.frozen).text;
                const key = keyOf(r);
                const label = `${r.frozen ? "مفرّز" : byDate ? "تاريخ الإنتاج" : DAY_NAMES[dayNumberOf(r.productionDate)]}${r.productionDate === today ? " (اليوم)" : ""}${r.isLastDay ? " · آخر يوم" : ""}`;
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <BatchBadge
                      productionDate={r.productionDate}
                      shelfLifeDays={p.shelfLifeDays}
                      frozen={r.frozen}
                    />
                    <span className="grow text-sm text-muted">{label}</span>
                    <div className="flex h-12 w-[140px] items-center justify-between overflow-hidden rounded-xl border border-line-strong bg-surface">
                      <button
                        type="button"
                        aria-label={`زيد ${p.nameEn} ${day}`}
                        className="flex size-12 items-center justify-center bg-quiet text-[22px]"
                        onClick={() => setQty(p.id, key, r.qty + 1)}
                      >
                        +
                      </button>
                      <NumberField
                        label={`${p.nameEn} ${day}`}
                        value={r.qty}
                        max={p.piecesPerCake === null ? MAX_COUNT_PIECES : MAX_COUNT_VALUE}
                        onChange={(next) => setQty(p.id, key, next)}
                        className="text-[19px]"
                      />
                      <button
                        type="button"
                        aria-label={`نقّص ${p.nameEn} ${day}`}
                        disabled={r.qty === 0}
                        className="flex size-12 items-center justify-center bg-quiet text-[22px] disabled:text-line-strong"
                        onClick={() => setQty(p.id, key, r.qty - 1)}
                      >
                        −
                      </button>
                    </div>
                  </div>
                );
              })}
              {freezing?.productId === p.id ? (
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={`مفرّز ${p.nameEn}`}
                >
                  <label className="flex items-center gap-2 text-sm">
                    ❄ تاريخ الإنتاج
                    <input
                      type="date"
                      aria-label={`تاريخ إنتاج المفرّز ${p.nameEn}`}
                      min={oldestFrozen}
                      max={today}
                      value={freezing.date}
                      onChange={(e) => setFreezing({ productId: p.id, date: e.target.value })}
                      className="h-12 rounded-xl border border-line-strong px-2"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!freezing.date || freezing.date < oldestFrozen || freezing.date > today}
                    onClick={() => addBatch(p.id, freezing.date, true)}
                    className="h-12 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    ضيف
                  </button>
                  <button
                    type="button"
                    onClick={() => setFreezing(null)}
                    className="h-12 px-3 text-sm text-muted"
                  >
                    رجوع
                  </button>
                </div>
              ) : picking === p.id ? (
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
                <div className="flex flex-wrap gap-2">
                  {free.length > 0 && (
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
                          ? "+ رقم يوم ثاني"
                          : "+ أضف رقم اليوم"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFreezing({ productId: p.id, date: today })}
                    aria-label={`ضيف مفرّز لـ ${p.nameEn}`}
                    className="h-12 rounded-full border border-dashed border-line-dashed px-4 text-sm text-muted"
                  >
                    + ❄ مفرّز
                  </button>
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
          {batches.length > 0 && (
            <span className="text-center text-sm text-muted">
              <strong className={notCounted.length > 0 ? "text-warn-text" : "text-ok-text"}>
                عدّيت {batches.length - notCounted.length} من {batches.length} دفعة
              </strong>
            </span>
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

      <Dialog open={askMissing} onClose={() => setAskMissing(false)} title="في دفعات ما عدّيتها">
        <p className="mb-2 text-[15px]">
          {notCounted.length === 1 ? "هالدفعة" : `هدول الـ${notCounted.length} دفعة`} رح{" "}
          {notCounted.length === 1 ? "تنحسب" : "ينحسبوا"} <strong>صفر</strong> (يعني ما في منهم بالمصنع):
        </p>
        <ul dir="auto" className="mb-4 max-h-48 overflow-y-auto text-sm text-muted">
          {notCounted.map((r) => {
            const p = productOf.get(r.productId);
            return (
              <li key={`${r.productId}:${keyOf(r)}`}>
                {p?.nameEn ?? ""} · {batchLabel(r.productionDate, p?.shelfLifeDays ?? 7, r.frozen).text}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setAskMissing(false)}
            className="h-14 rounded-[14px] bg-ink text-lg font-semibold text-white"
          >
            ارجع وعدّهم
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={save}
            className="h-12 rounded-xl border border-line-strong disabled:opacity-50"
          >
            {isSaving ? "لحظة…" : "أكيد، ما في منهم"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
