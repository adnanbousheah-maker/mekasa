"use client";

import { useState, useTransition } from "react";
import { setMonthlyCountActiveAction, setMonthlyCountTimeAction } from "../actions";
import type { MonthlyCountRow } from "../queries";
import { SavedSwitch } from "./SavedSwitch";

function whatOf(row: MonthlyCountRow): string {
  if (row.scope === "raw") return "المواد الأولية";
  return row.locationKind === "packaging" ? "مواد التغليف" : "الكيك";
}

function TimeField({ row }: { row: MonthlyCountRow }) {
  const [value, setValue] = useState(row.timeOfDay?.slice(0, 5) ?? "");
  const [saved, setSaved] = useState(row.timeOfDay?.slice(0, 5) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isSaving, startTransition] = useTransition();
  const label = `ساعة جرد آخر الشهر: ${whatOf(row)} · ${row.locationName}`;

  const save = () => {
    if (!value || value === saved) return;
    startTransition(async () => {
      const result = await setMonthlyCountTimeAction(row.locationId, row.scope, value);
      if (result.status === "error") setError(result.message);
      else {
        setError(null);
        setSaved(value);
        setJustSaved(true);
      }
    });
  };

  return (
    <span className="inline-flex flex-col gap-0.5">
      <input
        type="time"
        aria-label={label}
        value={value}
        disabled={isSaving}
        onChange={(e) => {
          setValue(e.target.value);
          setJustSaved(false);
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="h-10 rounded-lg border border-line-strong bg-surface px-2 text-[15px]"
      />
      {error && (
        <span role="alert" className="text-[11px] text-danger-text">
          {error}
        </span>
      )}
      {justSaved && !error && (
        <span role="status" className="text-[11px] text-ok-text">
          انحفظ
        </span>
      )}
    </span>
  );
}

/** جرد آخر الشهر لكل موقع: بآخر يوم بالشهر بالساعة اللي بتختارها، تذكير للموظفين و"متأخر" إلك. */
export function MonthlyCountsCard({ rows }: { rows: MonthlyCountRow[] }) {
  return (
    <section
      aria-label="جرد آخر الشهر"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-[18px]"
    >
      <h2 className="text-[17px] font-bold">جرد آخر الشهر</h2>
      <span className="text-[13px] leading-relaxed text-muted">
        بآخر يوم بكل شهر، بعد الدوام: كل موقع بيعدّ كل شي. الموظفين بياخذوا تذكير، وإذا تأخروا بيوصلك تنبيه.
        ساعة قبل 5 الصبح يعني بعد نص الليل.
      </span>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={`${row.locationId}:${row.scope}`}
            className="flex flex-wrap items-center gap-3 border-t border-line-soft py-3"
          >
            <span className="flex min-w-40 grow flex-col">
              <span className="text-[15px] font-semibold">
                {row.locationKind === "branch" ? `فرع ${row.locationName}` : row.locationName}
              </span>
              <span className="text-[13px] text-muted">جرد {whatOf(row)}</span>
            </span>
            <TimeField row={row} />
            <SavedSwitch
              key={`${row.timeOfDay}:${row.isActive}`}
              label={`جرد آخر الشهر: ${whatOf(row)} · ${row.locationName}`}
              initial={row.isActive}
              onSave={setMonthlyCountActiveAction.bind(null, row.locationId, row.scope)}
              size="sm"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
