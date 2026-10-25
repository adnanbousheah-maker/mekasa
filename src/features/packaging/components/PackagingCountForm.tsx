"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ProductName } from "@/components/ui/ProductName";
import { QuantityField } from "@/components/ui/QuantityField";
import { submitPackagingCountAction } from "../actions";

type Item = { id: string; nameEn: string };

/** جرد مستودع التغليف: عدد الحبات لكل مادة. اللي ما انعدّ بينحسب صفر، فبنحذّر قبل التأكيد. */
export function PackagingCountForm({ items, startedAt }: { items: Item[]; startedAt: string }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [counted, setCounted] = useState<Set<string>>(new Set());
  const [askMissing, setAskMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const set = (id: string, value: number) => {
    setQty((q) => ({ ...q, [id]: value }));
    setCounted((c) => new Set(c).add(id));
  };
  const notCounted = items.filter((i) => !counted.has(i.id));

  const save = () =>
    startTransition(async () => {
      setAskMissing(false);
      const result = await submitPackagingCountAction({
        startedAt,
        lines: items.map((i) => ({ productId: i.id, qty: qty[i.id] ?? 0 })),
      });
      if (result.status === "error") setError(result.message);
      else router.replace("/packaging?counted=1");
    });

  return (
    <>
      <ul className="flex flex-col gap-2.5 pb-44">
        {items.map((i) => {
          const done = counted.has(i.id);
          return (
            <li
              key={i.id}
              className={`flex flex-col gap-2 rounded-2xl bg-surface p-3 ${done ? "border border-ok" : "border border-line"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <ProductName name={i.nameEn} className="text-[17px] font-semibold" />
                <QuantityField
                  label={`عدد ${i.nameEn}`}
                  value={qty[i.id] ?? 0}
                  onChange={(v) => set(i.id, v)}
                />
              </div>
              {done ? (
                <span className="self-start rounded-[10px] bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok-text">
                  ✓ انعدّ
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => set(i.id, 0)}
                  aria-label={`ما في ${i.nameEn}`}
                  className="h-10 self-start rounded-xl border border-line-strong px-3 text-sm"
                >
                  ما في منه
                </button>
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
          <strong
            className={`text-center text-sm ${notCounted.length > 0 ? "text-warn-text" : "text-ok-text"}`}
          >
            عدّيت {items.length - notCounted.length} من {items.length}
          </strong>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => (notCounted.length > 0 ? setAskMissing(true) : save())}
            className="h-14 rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "تأكيد الجرد"}
          </button>
        </div>
      </div>

      <Dialog open={askMissing} onClose={() => setAskMissing(false)} title="في مواد ما عدّيتها">
        <p className="mb-2 text-[15px]">
          رح تنحسب <strong>صفر</strong> (يعني ما في منها بالمستودع):
        </p>
        <p dir="auto" className="mb-4 max-h-40 overflow-y-auto text-sm text-muted">
          {notCounted.map((i) => i.nameEn).join("، ")}
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
