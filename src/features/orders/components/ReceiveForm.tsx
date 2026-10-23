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

type Row = { wholeCakes: number; loosePieces: number; ok: boolean; note: string };

/** design/branch/Receive: الأسطر هي أسطر الإخراج. كل صنف بيتأكد، والفرق بيروح للمدير. */
export function ReceiveForm({
  dispatchId,
  lines,
  doneHref,
}: {
  dispatchId: string;
  lines: ReceiveLine[];
  doneHref: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.lineId,
        { wholeCakes: l.wholeCakes, loosePieces: l.loosePieces, ok: false, note: "" },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const change = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const piecesOf = (l: ReceiveLine, r: Row) => r.wholeCakes * (l.piecesPerCake ?? 0) + r.loosePieces;
  const done = lines.filter((l) => rows[l.lineId].ok).length;
  const hasDiff = lines.some((l) => piecesOf(l, rows[l.lineId]) !== l.qtyPieces);

  const confirm = () =>
    startTransition(async () => {
      const result = await receiveDispatchAction({
        dispatchId,
        lines: lines.map((l) => ({
          dispatchLineId: l.lineId,
          wholeCakes: rows[l.lineId].wholeCakes,
          loosePieces: rows[l.lineId].loosePieces,
          note: rows[l.lineId].note,
        })),
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
                  label="قطع"
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
            disabled={done < lines.length || isSaving}
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
