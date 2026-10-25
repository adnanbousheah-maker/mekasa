"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { QuantityField } from "@/components/ui/QuantityField";
import { submitPackagingCountAction } from "../actions";

type Item = { id: string; nameEn: string };

/** جرد مستودع التغليف: عدد الحبات لكل مادة. اللي ما بتعبيه بينحسب صفر. */
export function PackagingCountForm({ items, startedAt }: { items: Item[]; startedAt: string }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await submitPackagingCountAction({
        startedAt,
        lines: items.map((i) => ({ productId: i.id, qty: qty[i.id] ?? 0 })),
      });
      if (result.status === "error") setError(result.message);
      else router.replace("/packaging?counted=1");
    });

  return (
    <>
      <ul className="flex flex-col gap-2.5 pb-40">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3"
          >
            <ProductName name={i.nameEn} className="text-[17px] font-semibold" />
            <QuantityField
              label={`عدد ${i.nameEn}`}
              value={qty[i.id] ?? 0}
              onChange={(v) => setQty((q) => ({ ...q, [i.id]: v }))}
            />
          </li>
        ))}
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
          <span className="text-center text-sm text-muted">اللي ما بتعبيه بينحسب صفر</span>
          <button
            type="button"
            disabled={isSaving}
            onClick={confirm}
            className="h-14 rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "تأكيد الجرد"}
          </button>
        </div>
      </div>
    </>
  );
}
