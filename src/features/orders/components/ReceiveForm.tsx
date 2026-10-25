"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { Stepper } from "@/components/ui/Stepper";
import { formatQuantity } from "@/lib/units";
import { receiveDispatchAction } from "../actions";
import { receiptDifference } from "../logic";

export interface ReceiveLine {
  lineId: string;
  productName: string;
  piecesPerCake: number | null;
  wholeCakes: number;
  loosePieces: number;
  qtyPieces: number;
  // null = صنف إضافي ما كان بالطلب، undefined = إخراج بدون طلب
  requestedPieces?: number | null;
}

type Row = {
  wholeCakes: number;
  loosePieces: number;
  ok: boolean;
  note: string;
  // التالف من التوصيل (من اللي وصل)
  damaged: boolean;
  damagedWhole: number;
  damagedLoose: number;
};

/** design/branch/Receive: الأسطر هي أسطر الإخراج. كل صنف بيتأكد، والفرق بيروح للمدير. */
export function ReceiveForm({
  dispatchId,
  lines,
  doneHref,
  packaging = false,
}: {
  // مواد التغليف: بالحبة، والرقم بينكتب
  packaging?: boolean;
  dispatchId: string;
  lines: ReceiveLine[];
  doneHref: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.lineId,
        {
          wholeCakes: l.wholeCakes,
          loosePieces: l.loosePieces,
          ok: false,
          note: "",
          damaged: false,
          damagedWhole: 0,
          damagedLoose: 0,
        },
      ]),
    ),
  );
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const change = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const piecesOf = (l: ReceiveLine, r: Row) => r.wholeCakes * (l.piecesPerCake ?? 0) + r.loosePieces;
  const done = lines.filter((l) => rows[l.lineId].ok).length;
  const hasDiff = lines.some((l) => piecesOf(l, rows[l.lineId]) !== l.qtyPieces);
  const damagedOf = (l: ReceiveLine, r: Row) =>
    r.damaged ? r.damagedWhole * (l.piecesPerCake ?? 0) + r.damagedLoose : 0;
  const hasDamage = lines.some((l) => damagedOf(l, rows[l.lineId]) > 0);
  const tooMuchDamage = lines.some((l) => damagedOf(l, rows[l.lineId]) > piecesOf(l, rows[l.lineId]));

  const confirm = () =>
    startTransition(async () => {
      const result = await receiveDispatchAction({
        dispatchId,
        lines: lines.map((l) => ({
          dispatchLineId: l.lineId,
          wholeCakes: rows[l.lineId].wholeCakes,
          loosePieces: rows[l.lineId].loosePieces,
          note: rows[l.lineId].note,
          damagedWhole: rows[l.lineId].damaged ? rows[l.lineId].damagedWhole : 0,
          damagedLoose: rows[l.lineId].damaged ? rows[l.lineId].damagedLoose : 0,
        })),
        checked: true,
      });
      if (result.status === "error") setError(result.message);
      else router.replace(doneHref);
    });

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">
          {done} من {lines.length} أصناف تأكدت
        </span>
        <div className="h-2 rounded bg-quiet">
          <div
            className="h-2 rounded bg-ok"
            style={{ width: `${(done / Math.max(lines.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 pb-40">
        {lines.map((l) => {
          const r = rows[l.lineId];
          const got = piecesOf(l, r);
          const diff = receiptDifference(
            l.piecesPerCake ? l.qtyPieces / l.piecesPerCake : l.qtyPieces,
            l.piecesPerCake ? got / l.piecesPerCake : got,
            l.piecesPerCake,
          );
          const req =
            l.requestedPieces === undefined
              ? null
              : l.requestedPieces === null
                ? "صنف إضافي، ما كان بطلبك"
                : l.requestedPieces === l.qtyPieces
                  ? "متل ما طلبت"
                  : `كنت طالب ${formatQuantity(l.requestedPieces, l.piecesPerCake)}`;
          return (
            <li
              key={l.lineId}
              aria-label={l.productName}
              className={`flex flex-col gap-2.5 rounded-2xl bg-surface p-3.5 ${diff ? "border-2 border-danger" : r.ok ? "border-2 border-ok" : "border border-line"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <ProductName name={l.productName} className="text-[17px] font-semibold" />
                  <span className="text-[13px] text-muted">
                    طلع: {formatQuantity(l.qtyPieces, l.piecesPerCake)}
                  </span>
                  {req && (
                    <span
                      className={
                        l.requestedPieces === l.qtyPieces
                          ? "text-[13px] text-muted"
                          : "self-start rounded-[10px] bg-info-soft px-2.5 py-0.5 text-[13px] font-semibold text-info-text"
                      }
                    >
                      {req}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => change(l.lineId, { ok: !r.ok })}
                  aria-label={r.ok ? `إلغاء تأكيد ${l.productName}` : `تأكيد ${l.productName}`}
                  aria-pressed={r.ok}
                  className={`flex size-[52px] shrink-0 items-center justify-center rounded-full ${r.ok ? "bg-ok text-white" : "border-2 border-line-strong text-switch-off"}`}
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                </button>
              </div>
              <span className="text-sm font-semibold">وصل فعلياً:</span>
              <div className={`grid gap-2.5 ${l.piecesPerCake === null ? "grid-cols-1" : "grid-cols-2"}`}>
                {l.piecesPerCake !== null && (
                  <Stepper
                    label="كيكات"
                    value={r.wholeCakes}
                    onChange={(v) => change(l.lineId, { wholeCakes: v, ok: true })}
                    incrementLabel={`زيد كيكة ${l.productName}`}
                    decrementLabel={`نقّص كيكة ${l.productName}`}
                  />
                )}
                <Stepper
                  label={packaging ? "حبات" : "قطع"}
                  typed={packaging}
                  value={r.loosePieces}
                  onChange={(v) => change(l.lineId, { loosePieces: v, ok: true })}
                  incrementLabel={`زيد قطعة ${l.productName}`}
                  decrementLabel={`نقّص قطعة ${l.productName}`}
                />
              </div>
              {diff && (
                <div className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3">
                  <span className="font-semibold text-danger-text">{diff}</span>
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] text-danger-text">ملاحظة (اختياري)</span>
                    <input
                      value={r.note}
                      maxLength={300}
                      onChange={(e) => change(l.lineId, { note: e.target.value })}
                      placeholder="مثلاً: وحدة وصلت مكسورة"
                      className="h-11 rounded-lg border border-danger-line bg-surface px-3"
                    />
                  </label>
                </div>
              )}
              {r.damaged ? (
                <div className="flex flex-col gap-2 rounded-xl bg-warn-soft p-3">
                  <span className="text-sm font-semibold text-warn-text">
                    قديش وصل تالف من التوصيل؟ (بينحسب من اللي وصل وبينسجل تالف)
                  </span>
                  <div className={`grid gap-2.5 ${l.piecesPerCake === null ? "grid-cols-1" : "grid-cols-2"}`}>
                    {l.piecesPerCake !== null && (
                      <Stepper
                        label="كيكات تالفة"
                        value={r.damagedWhole}
                        onChange={(v) => change(l.lineId, { damagedWhole: v })}
                        incrementLabel={`زيد كيكة تالفة ${l.productName}`}
                        decrementLabel={`نقّص كيكة تالفة ${l.productName}`}
                      />
                    )}
                    <Stepper
                      label={packaging ? "حبات تالفة" : "قطع تالفة"}
                      typed={packaging}
                      value={r.damagedLoose}
                      onChange={(v) => change(l.lineId, { damagedLoose: v })}
                      incrementLabel={`زيد قطعة تالفة ${l.productName}`}
                      decrementLabel={`نقّص قطعة تالفة ${l.productName}`}
                    />
                  </div>
                  {damagedOf(l, r) > piecesOf(l, r) && (
                    <span className="text-sm font-semibold text-danger-text">التالف أكثر من اللي وصل</span>
                  )}
                  <button
                    type="button"
                    onClick={() => change(l.lineId, { damaged: false, damagedWhole: 0, damagedLoose: 0 })}
                    className="h-11 self-start rounded-lg px-3 text-sm text-muted"
                  >
                    ما في تالف
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => change(l.lineId, { damaged: true })}
                  className="h-12 self-start rounded-xl border border-warn-line px-4 text-[15px] font-semibold text-warn-text"
                >
                  في تالف من التوصيل؟
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-5 pt-3 pb-6">
          {hasDiff && (
            <span className="text-center text-sm font-semibold text-danger-text">
              في فرق بالكمية، رح يوصل للمدير
            </span>
          )}
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 py-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="size-6 shrink-0 accent-ink"
            />
            <span className="text-[15px] font-semibold">
              {hasDamage ? "سجّلت التوالف وفحصت الباقي قدام السائق" : "فحصت البضاعة قدام السائق وما في توالف"}
            </span>
          </label>
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
            disabled={done < lines.length || !checked || tooMuchDamage || isSaving}
            onClick={confirm}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:bg-line disabled:text-muted"
          >
            {isSaving ? "لحظة…" : "تأكيد الاستلام"}
          </button>
        </div>
      </div>
    </>
  );
}
