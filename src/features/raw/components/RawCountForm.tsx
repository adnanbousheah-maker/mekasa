"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { DraftNotice } from "@/features/counts/components/DraftNotice";
import { useCountDraft } from "@/features/counts/draft";
import { submitRawCountAction } from "../actions";
import { amount, groupMaterials, shortName } from "../logic";
import type { RawMaterialRow } from "../queries";

// المكتوب لكل مادة: خانة لكل وحدة (BASE = الوحدة الأساسية، وإلا رقم التعبئة)
const BASE = "base";
type Row = Record<string, string>;

const parse = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
const isFilled = (v: string | undefined) => !!v && v.trim() !== "" && Number.isFinite(parse(v));

/** المسودة القديمة كانت { qty, unitId } لكل مادة: بنحوّلها للشكل الجديد. */
function fromSaved(saved: unknown): Row | null {
  if (!saved || typeof saved !== "object") return null;
  const old = saved as { qty?: unknown; unitId?: unknown };
  if (typeof old.qty === "string") return { [typeof old.unitId === "string" ? old.unitId : BASE]: old.qty };
  return saved as Row;
}

/**
 * جرد المواد الأولية اليومي: لكل مادة خانة لكل تعبئة إلها (مثلاً كيس، كرتونة، كيلو)، والعامل بيعبّي
 * اللي موجود منها (25 نوفمبر: "كيسين + كرتونة + 3 كيلو")، والمجموع بالوحدة الأساسية تحت.
 * الجرد كامل (اجتماع 20 نوفمبر): اللي ما انكتب بينحسب صفر، فقبل التأكيد بنسأل "في مواد ما عدّيتها".
 */
export function RawCountForm({ materials, startedAt }: { materials: RawMaterialRow[]; startedAt: string }) {
  const router = useRouter();
  const blankRows = () => Object.fromEntries(materials.map((m) => [m.id, {}])) as Record<string, Row>;
  const [rows, setRows] = useState<Record<string, Row>>(blankRows);
  const draft = useCountDraft(
    "raw",
    rows,
    (saved) =>
      setRows((current) =>
        Object.fromEntries(Object.entries(current).map(([id, r]) => [id, fromSaved(saved[id]) ?? r])),
      ),
    startedAt,
  );
  const [error, setError] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [isSaving, startTransition] = useTransition();

  const unitsOf = (m: RawMaterialRow) => [
    ...m.units.map((u) => ({ key: u.id, name: u.name, factor: u.factor })),
    { key: BASE, name: m.baseUnit, factor: 1 },
  ];
  const filledKeys = (m: RawMaterialRow) => unitsOf(m).filter((u) => isFilled(rows[m.id]?.[u.key]));
  const totalOf = (m: RawMaterialRow) =>
    filledKeys(m).reduce((sum, u) => sum + parse(rows[m.id][u.key]) * u.factor, 0);

  const filled = materials.filter((m) => filledKeys(m).length > 0);
  const missing = materials.filter((m) => filledKeys(m).length === 0);

  const setValue = (materialId: string, key: string, value: string) =>
    setRows((r) => ({ ...r, [materialId]: { ...r[materialId], [key]: value } }));

  const unitFields = (m: RawMaterialRow) =>
    unitsOf(m).map((u) => (
      <label key={u.key} className="flex flex-col items-center gap-1">
        <input
          inputMode="decimal"
          aria-label={`${m.name} ${u.name}`}
          value={rows[m.id]?.[u.key] ?? ""}
          onChange={(e) => setValue(m.id, u.key, e.target.value)}
          className="h-12 w-full rounded-xl border border-line-strong text-center text-lg font-bold"
        />
        <span className="text-xs text-muted">
          {u.name}
          {u.key !== BASE && ` (${amount(u.factor, m.baseUnit)})`}
        </span>
      </label>
    ));

  const submit = () =>
    startTransition(async () => {
      setMissingOpen(false);
      const result = await submitRawCountAction({
        startedAt: draft.startedAt,
        lines: materials.flatMap((m) => {
          const parts = filledKeys(m);
          if (parts.length === 0) return [{ materialId: m.id, unitId: null, qty: 0 }];
          return parts.map((u) => ({
            materialId: m.id,
            unitId: u.key === BASE ? null : u.key,
            qty: parse(rows[m.id][u.key]),
          }));
        }),
      });
      if (result.status === "error") setError(result.message);
      else {
        draft.clear();
        router.replace("/factory/raw?counted=1");
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
        {groupMaterials(materials).map((group) => {
          if (group.length === 1) {
            const m = group[0]!;
            const parts = filledKeys(m);
            return (
              <li
                key={m.id}
                aria-label={m.name}
                className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold">{m.name}</span>
                  {parts.length > 0 && (
                    <span className="text-sm text-muted">المجموع: {amount(totalOf(m), m.baseUnit)}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">{unitFields(m)}</div>
              </li>
            );
          }
          // مواد بنفس المجموعة (مثلاً قواعد كيك كبير ووسط): كرت واحد، وكل مادة عمود لحالها وبينهم فراغ
          const title = group[0]!.countGroup!;
          return (
            <li
              key={`group-${title}`}
              aria-label={title}
              className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-3"
            >
              <span className="text-base font-semibold">{title}</span>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {group.map((m) => (
                  <div key={m.id} role="group" aria-label={m.name} className="flex flex-col gap-2">
                    <span className="text-center text-sm font-semibold">
                      {shortName(m.name, m.countGroup)}
                    </span>
                    {unitFields(m)}
                    {filledKeys(m).length > 0 && unitsOf(m).length > 1 && (
                      <span className="text-center text-xs text-muted">
                        المجموع: {amount(totalOf(m), m.baseUnit)}
                      </span>
                    )}
                  </div>
                ))}
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
            انعدّ {filled.length} من {materials.length}
          </span>
          <button
            type="button"
            disabled={isSaving || materials.length === 0}
            onClick={() => (missing.length > 0 ? setMissingOpen(true) : submit())}
            className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "تأكيد جرد المواد"}
          </button>
        </div>
      </div>
      <Dialog open={missingOpen} onClose={() => setMissingOpen(false)} title="في مواد ما عدّيتها">
        <p className="text-[15px]">
          {missing.length === 1 ? "هالمادة" : `هدول الـ${missing.length}`} ما انكتبلهم رقم، وإذا أكّدت
          بينحسبوا صفر:
        </p>
        <p className="mt-2 max-h-40 overflow-y-auto text-sm text-muted">
          {missing.map((m) => m.name).join("، ")}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMissingOpen(false)}
            className="h-12 rounded-xl bg-ink font-semibold text-white"
          >
            ارجع وعدّهم
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={submit}
            className="h-12 rounded-xl border border-line-strong font-semibold"
          >
            أكيد، ما في منهم
          </button>
        </div>
      </Dialog>
    </>
  );
}
