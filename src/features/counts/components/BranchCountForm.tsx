"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ProductName } from "@/components/ui/ProductName";
import { Stepper } from "@/components/ui/Stepper";
import { countPhrase } from "@/lib/units";
import { submitCountAction } from "../actions";
import type { CountProduct } from "../queries";
import { countTotals, type CountLine } from "../schemas";

export type PrefilledLine = {
  wholeCakes: number;
  loosePieces: number;
  // الجرد بالصورة: الرقم مش أكيد (برتقالي لحد ما الموظف يلمسه)
  unsure?: boolean;
  ocr?: CountLine["ocr"];
};

type Props = {
  products: CountProduct[];
  scheduleId: string | null;
  startedAt: string;
  initial?: Record<string, PrefilledLine>;
  photo?: { path: string; formVersionId: string | null };
};

// counted: الموظف لمس السطر (عدّه أو قال "ما في منه"). اللي ما انلمس بينحسب صفر، فبنحذّر قبل التأكيد.
type Row = { wholeCakes: number; loosePieces: number; unsure: boolean; counted: boolean };

/** design/branch/CountConfirm: كيكات وقطع لكل صنف، وتأكيد بأسفل الشاشة. */
export function BranchCountForm({ products, scheduleId, startedAt, initial = {}, photo }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      products.map((p) => {
        const pre = initial[p.id];
        return [
          p.id,
          {
            wholeCakes: pre?.wholeCakes ?? 0,
            loosePieces: pre?.loosePieces ?? 0,
            unsure: !!pre?.unsure,
            // الأرقام من الصورة انعدّت على الورقة
            counted: pre !== undefined,
          },
        ];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [askMissing, setAskMissing] = useState(false);
  const [isSaving, startTransition] = useTransition();

  const update = (id: string, key: "wholeCakes" | "loosePieces", value: number) =>
    setRows((current) => ({
      ...current,
      [id]: { ...current[id], [key]: value, unsure: false, counted: true },
    }));
  const markNone = (id: string) =>
    setRows((current) => ({
      ...current,
      [id]: { wholeCakes: 0, loosePieces: 0, unsure: false, counted: true },
    }));

  const notCounted = products.filter((p) => !rows[p.id].counted);
  const visible = products.filter(
    (p) => !q.trim() || p.nameEn.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const unsureCount = Object.values(rows).filter((r) => r.unsure).length;
  const totals = countTotals(Object.values(rows));

  const confirm = () => {
    if (notCounted.length > 0 && !askMissing) {
      setAskMissing(true);
      return;
    }
    save();
  };

  const save = () =>
    startTransition(async () => {
      setAskMissing(false);
      const result = await submitCountAction({
        scheduleId,
        startedAt,
        method: photo ? "photo" : "manual",
        photoPath: photo?.path ?? null,
        formVersionId: photo?.formVersionId ?? null,
        lines: products.map((p) => ({
          productId: p.id,
          wholeCakes: p.piecesPerCake === null ? 0 : rows[p.id].wholeCakes,
          loosePieces: rows[p.id].loosePieces,
          ocr: initial[p.id]?.ocr,
        })),
      });
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.replace(`/count/done?id=${result.countId}`);
      }
    });

  return (
    <>
      {unsureCount > 0 && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2.5"
        >
          <span aria-hidden="true" className="text-warn">
            ⚠
          </span>
          <span className="text-[15px] text-warn-text">
            <strong>
              {unsureCount === 1 ? "رقم واحد" : unsureCount === 2 ? "رقمين" : `${unsureCount} أرقام`}
            </strong>{" "}
            مش واضحين بالصورة، تأكد منهم
          </span>
        </div>
      )}

      <label className="flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="دوّر على صنف"
          aria-label="دوّر على صنف"
          className="grow bg-transparent text-base outline-none"
        />
      </label>

      <ul className="flex flex-col gap-2.5 pb-44">
        {visible.map((p) => {
          const row = rows[p.id];
          return (
            <li
              key={p.id}
              aria-label={p.nameEn}
              className={`flex flex-col gap-2.5 rounded-2xl bg-surface p-3 ${row.unsure ? "border-2 border-warn-edge" : row.counted ? "border border-ok" : "border border-line"}`}
            >
              <div className="flex items-center gap-3">
                <ProductName name={p.nameEn} className="grow text-[17px] font-semibold" />
                {row.unsure ? (
                  <span className="rounded-[10px] bg-warn-chip px-2.5 py-0.5 text-xs font-semibold text-warn-text">
                    تأكد
                  </span>
                ) : row.counted ? (
                  <span className="rounded-[10px] bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok-text">
                    ✓ انعدّ
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => markNone(p.id)}
                    aria-label={`ما في ${p.nameEn}`}
                    className="h-10 rounded-xl border border-line-strong px-3 text-sm"
                  >
                    ما في منه
                  </button>
                )}
              </div>
              <div className={`grid gap-2.5 ${p.piecesPerCake === null ? "grid-cols-1" : "grid-cols-2"}`}>
                {p.piecesPerCake !== null && (
                  <Stepper
                    label="كيكات"
                    value={row.wholeCakes}
                    onChange={(v) => update(p.id, "wholeCakes", v)}
                    incrementLabel={`زيد كيكة ${p.nameEn}`}
                    decrementLabel={`نقّص كيكة ${p.nameEn}`}
                  />
                )}
                <Stepper
                  label={p.piecesPerCake === null ? "قطع (قطع بس)" : "قطع"}
                  value={row.loosePieces}
                  onChange={(v) => update(p.id, "loosePieces", v)}
                  incrementLabel={`زيد قطعة ${p.nameEn}`}
                  decrementLabel={`نقّص قطعة ${p.nameEn}`}
                />
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
            <strong className={notCounted.length > 0 ? "text-warn-text" : "text-ok-text"}>
              عدّيت {products.length - notCounted.length} من {products.length}
            </strong>{" "}
            · {countPhrase(totals.cakes, "cake")} · {countPhrase(totals.pieces, "piece")}
          </span>
          <button
            type="button"
            disabled={isSaving}
            onClick={confirm}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? "لحظة…" : "تأكيد الجرد"}
          </button>
        </div>
      </div>

      <Dialog open={askMissing} onClose={() => setAskMissing(false)} title="في أصناف ما عدّيتها">
        <p className="mb-2 text-[15px]">
          {notCounted.length === 1 ? "هالصنف" : `هدول الـ${notCounted.length}`} رح{" "}
          {notCounted.length === 1 ? "ينحسب" : "ينحسبوا"} <strong>صفر</strong> (يعني ما في منهم بالفرع):
        </p>
        <p dir="auto" className="mb-4 max-h-40 overflow-y-auto text-sm text-muted">
          {notCounted.map((p) => p.nameEn).join("، ")}
        </p>
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
