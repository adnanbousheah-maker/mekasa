"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DayBadge } from "@/components/ui/DayBadge";
import { ProductName } from "@/components/ui/ProductName";
import { correctCountLineAction } from "@/features/counts/actions";
import type { DayNumber } from "@/lib/day-number";
import { formatQuantityCompact } from "@/lib/units";
import type { BreakdownLine } from "../queries";

type Props = { lines: BreakdownLine[]; isOpening: boolean; isFactory: boolean };

type Edit = { wholeCakes: string; loosePieces: string };

const cell = "px-3 py-2.5 text-center tabular-nums whitespace-nowrap";

/** design/admin/AdminCounts: أرقام الجرد، والتعديل بسبب إجباري (للأدمن). */
export function CountLinesTable({ lines, isOpening, isFactory }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);
  // أسطر كلها صفر (الصنف مش موجود ولا انعد) بتنخفى إلا إذا طلبها الأدمن
  const isEmpty = (l: BreakdownLine) =>
    [l.counted, l.prev ?? 0, l.in, l.out, l.waste, l.other, l.adjustment].every((n) => n === 0);
  const hidden = lines.filter(isEmpty).length;
  const visible = showAll || editing ? lines : lines.filter((l) => !isEmpty(l));

  const q = (n: number, ppc: number | null) => (n === 0 ? "0" : formatQuantityCompact(n, ppc));

  const changed = lines.filter((l) => {
    const e = edits[l.lineId];
    return e && (Number(e.wholeCakes) !== l.wholeCakes || Number(e.loosePieces) !== l.loosePieces);
  });

  const save = () =>
    startTransition(async () => {
      setError(null);
      if (changed.length === 0) {
        setEditing(false);
        return;
      }
      for (const line of changed) {
        const e = edits[line.lineId];
        const whole = Number(e.wholeCakes);
        const pieces = Number(e.loosePieces);
        if (!Number.isInteger(whole) || !Number.isInteger(pieces) || whole < 0 || pieces < 0) {
          setError(`الرقم مش صحيح لـ ${line.productName}`);
          return;
        }
        const result = await correctCountLineAction({
          lineId: line.lineId,
          wholeCakes: whole,
          loosePieces: pieces,
          reason,
        });
        if (result.status === "error") {
          setError(`${line.productName}: ${result.message}`);
          return;
        }
      }
      setEditing(false);
      setEdits({});
      setReason("");
      router.refresh();
    });

  return (
    <section aria-label="الأرقام" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {hidden > 0 && !editing ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-sm text-muted underline"
          >
            {showAll ? "خبّي الأصناف اللي كلها صفر" : `اعرض كمان ${hidden} صنف كلهم صفر`}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => {
            setEditing((e) => !e);
            setError(null);
          }}
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-3.5 text-sm font-semibold"
        >
          {editing ? "إلغاء التعديل" : "تعديل الأرقام"}
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                الصنف
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                الجرد قبل
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                دخل
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                طلع
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                تالف
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                المتوقع
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                العد
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                {isFactory ? "الفرق" : "الاستهلاك"}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => {
              const impossible = !isOpening && l.adjustment > 0;
              const unsureOcr =
                (l.ocr.wholeConfidence !== null && l.ocr.wholeConfidence < 0.85) ||
                (l.ocr.piecesConfidence !== null && l.ocr.piecesConfidence < 0.85);
              const e = edits[l.lineId] ?? {
                wholeCakes: String(l.wholeCakes),
                loosePieces: String(l.loosePieces),
              };
              return (
                <tr
                  key={l.lineId}
                  className={`border-t border-line-soft ${impossible ? "bg-danger-soft" : ""}`}
                >
                  <th scope="row" className="px-3 py-2.5 text-right font-semibold">
                    <span className="inline-flex items-center gap-2">
                      {l.dayNumber && <DayBadge day={l.dayNumber as DayNumber} size="sm" />}
                      <ProductName name={l.productName} />
                    </span>
                  </th>
                  <td className={cell}>{l.prev === null ? "—" : q(l.prev, l.piecesPerCake)}</td>
                  <td className={cell}>{q(l.in, l.piecesPerCake)}</td>
                  <td className={cell}>{q(l.out, l.piecesPerCake)}</td>
                  <td className={cell}>{q(l.waste, l.piecesPerCake)}</td>
                  <td className={cell}>{q(l.expected, l.piecesPerCake)}</td>
                  <td className={`${cell} font-semibold ${unsureOcr ? "text-warn" : ""}`}>
                    {editing ? (
                      <span className="inline-flex items-center gap-1">
                        {l.piecesPerCake !== null && (
                          <input
                            inputMode="numeric"
                            aria-label={`كيكات ${l.productName}`}
                            value={e.wholeCakes}
                            onChange={(ev) =>
                              setEdits((s) => ({ ...s, [l.lineId]: { ...e, wholeCakes: ev.target.value } }))
                            }
                            className="h-9 w-12 rounded-lg border border-line-strong text-center"
                          />
                        )}
                        <input
                          inputMode="numeric"
                          aria-label={`قطع ${l.productName}`}
                          value={e.loosePieces}
                          onChange={(ev) =>
                            setEdits((s) => ({ ...s, [l.lineId]: { ...e, loosePieces: ev.target.value } }))
                          }
                          className="h-9 w-12 rounded-lg border border-line-strong text-center"
                        />
                      </span>
                    ) : (
                      q(l.counted, l.piecesPerCake)
                    )}
                  </td>
                  <td className={`${cell} ${impossible ? "font-bold text-danger" : ""}`}>
                    {isOpening ? "افتتاحي" : q(-l.adjustment, l.piecesPerCake)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
          <label className="flex grow flex-col gap-1.5">
            <span className="text-sm font-semibold">سبب التعديل (إجباري)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلاً: الصورة بتبين 1 مش 11"
              maxLength={300}
              className="h-11 rounded-xl border border-line-strong px-3 outline-none focus:border-ink"
            />
          </label>
          <button
            type="button"
            disabled={isSaving || reason.trim().length < 3 || changed.length === 0}
            onClick={save}
            className="h-11 rounded-xl bg-ink px-5 font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : `حفظ التعديل${changed.length ? ` (${changed.length})` : ""}`}
          </button>
          {error && (
            <p role="alert" className="w-full text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
