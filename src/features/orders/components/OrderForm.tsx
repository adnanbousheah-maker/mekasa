"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ProductName } from "@/components/ui/ProductName";
import { QuantityField } from "@/components/ui/QuantityField";
import { Stepper } from "@/components/ui/Stepper";
import { formatQuantity } from "@/lib/units";
import { createRequestAction } from "../actions";
import { forgottenItems, linesSummary, orderTarget, suggestQuantity } from "../logic";
import type { OrderProduct } from "../queries";

type Row = { wholeCakes: number; loosePieces: number; suggestedPieces: number };

/** design/branch/Order: الكميات مقترحة (استهلاك بكرا − الموجود)، ومراجعة قبل الإرسال. */
export function OrderForm({
  products,
  tomorrowName,
  packaging = false,
}: {
  products: OrderProduct[];
  tomorrowName: string;
  // طلب تغليف: كميات بالحبة بخانة رقم، وما بنعرض ستوك الفرع (ما بينجرد لسا)
  packaging?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      products.map((p) => [
        p.id,
        suggestQuantity(orderTarget(p.avgPieces, p.parPieces), p.stockPieces, p.piecesPerCake),
      ]),
    ),
  );
  const [q, setQ] = useState("");
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const visible = useMemo(
    () => products.filter((p) => !q.trim() || p.nameEn.toLowerCase().includes(q.trim().toLowerCase())),
    [products, q],
  );
  const picked = products.filter((p) => rows[p.id].wholeCakes + rows[p.id].loosePieces > 0);
  const forgotten = forgottenItems(products, rows);
  const summary = packaging
    ? `${picked.length} ${picked.length >= 3 && picked.length <= 10 ? "أصناف" : "صنف"} · ${picked.reduce((n, p) => n + rows[p.id].loosePieces, 0)} حبة`
    : linesSummary(picked.map((p) => rows[p.id]));
  const update = (id: string, key: "wholeCakes" | "loosePieces", value: number) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], [key]: value } }));

  const send = () =>
    startTransition(async () => {
      const result = await createRequestAction({
        lines: picked.map((p) => ({ productId: p.id, ...rows[p.id] })),
        missing: forgotten.map((p) => ({ productId: p.id, suggestedPieces: rows[p.id].suggestedPieces })),
      });
      if (result.status === "error") {
        setError(result.message);
        setReview(false);
      } else router.replace(packaging ? "/orders?sent=packaging" : "/orders?sent=1");
    });

  return (
    <>
      <label className="flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="دوّر على صنف"
          aria-label="دوّر على صنف"
          className="grow bg-transparent text-base outline-none"
        />
      </label>

      <ul className="flex flex-col gap-2.5 pb-40">
        {visible.map((p) => {
          const row = rows[p.id];
          const active = row.wholeCakes + row.loosePieces > 0;
          return (
            <li
              key={p.id}
              aria-label={p.nameEn}
              className={`flex flex-col gap-2.5 rounded-2xl bg-surface p-3 ${active ? "border-2 border-ink" : "border border-line"}`}
            >
              {packaging ? (
                <div className="flex items-center justify-between gap-3">
                  <ProductName name={p.nameEn} className="text-[17px] font-semibold" />
                  <QuantityField
                    label={`عدد ${p.nameEn}`}
                    value={row.loosePieces}
                    max={9999}
                    onChange={(v) => update(p.id, "loosePieces", v)}
                  />
                </div>
              ) : (
                <>
                  <div className="flex flex-col">
                    <ProductName name={p.nameEn} className="text-[17px] font-semibold" />
                    <span className="text-[13px] text-muted">
                      عندك {formatQuantity(Math.max(0, p.stockPieces), p.piecesPerCake)}
                      {p.avgPieces !== null
                        ? ` · بيروح ${formatQuantity(p.avgPieces, p.piecesPerCake)} يوم ${tomorrowName}`
                        : p.parPieces !== undefined &&
                          ` · الحد ${formatQuantity(p.parPieces, p.piecesPerCake)}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {p.piecesPerCake === null ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[13px] text-muted">كيكات</span>
                        <div className="flex h-12 items-center justify-center rounded-xl bg-quiet text-[13px] text-muted">
                          قطع بس
                        </div>
                      </div>
                    ) : (
                      <Stepper
                        label="كيكات"
                        value={row.wholeCakes}
                        onChange={(v) => update(p.id, "wholeCakes", v)}
                        incrementLabel={`زيد كيكة ${p.nameEn}`}
                        decrementLabel={`نقّص كيكة ${p.nameEn}`}
                      />
                    )}
                    <Stepper
                      label="قطع"
                      value={row.loosePieces}
                      onChange={(v) => update(p.id, "loosePieces", v)}
                      incrementLabel={`زيد قطعة ${p.nameEn}`}
                      decrementLabel={`نقّص قطعة ${p.nameEn}`}
                    />
                  </div>
                </>
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
          <span className="text-center text-sm text-muted">{summary}</span>
          <button
            type="button"
            onClick={() => setReview(true)}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white"
          >
            مراجعة الطلب
          </button>
        </div>
      </div>

      <Dialog open={review} onClose={() => setReview(false)} title="راجع طلبك قبل الإرسال">
        {picked.length === 0 ? (
          <p className="mb-4 text-muted">ما اخترت ولا صنف لسا</p>
        ) : (
          <ul className="mb-4 flex max-h-[50vh] flex-col overflow-y-auto">
            {picked.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 border-b border-line-soft py-2.5">
                <ProductName name={p.nameEn} className="font-semibold" />
                <span className="text-muted">
                  {[
                    rows[p.id].wholeCakes ? `${rows[p.id].wholeCakes} كيكة` : "",
                    rows[p.id].loosePieces ? `${rows[p.id].loosePieces} ${packaging ? "حبة" : "قطعة"}` : "",
                  ]
                    .filter(Boolean)
                    .join(" + ")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {picked.length > 0 && forgotten.length > 0 && (
          <div role="alert" className="mb-4 flex flex-col gap-1.5 rounded-xl bg-warn-soft p-3 text-warn-text">
            <span className="font-semibold">
              دير بالك: {forgotten.length === 1 ? "هالصنف انت ما طلبته" : "هالأصناف انت ما طلبتها"}
            </span>
            <ul className="flex flex-col gap-0.5 text-sm">
              {forgotten.map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <ProductName name={p.nameEn} />
                  <span>المقترح {formatQuantity(rows[p.id].suggestedPieces, p.piecesPerCake)}</span>
                </li>
              ))}
            </ul>
            <span className="text-[13px]">إذا بتبعت بدونهم، المدير رح يوصله إشعار.</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={picked.length === 0 || isSaving}
            onClick={send}
            className="h-14 rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : packaging ? "إرسال الطلب لمستودع التغليف" : "إرسال الطلب للمصنع"}
          </button>
          <button
            type="button"
            onClick={() => setReview(false)}
            className="h-12 rounded-xl border border-line-strong"
          >
            رجوع للتعديل
          </button>
        </div>
      </Dialog>
    </>
  );
}
