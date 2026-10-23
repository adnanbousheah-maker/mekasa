"use client";

import { useState, useTransition } from "react";
import { addScheduleTimeAction, removeScheduleTimeAction } from "../actions";
import { formatScheduleTime } from "../schemas";

type Props = {
  locationId: string;
  name: string;
  note: string;
  times: { id: string; timeOfDay: string }[];
};

export function ScheduleCard({ locationId, name, note, times }: Props) {
  const [adding, setAdding] = useState(false);
  const [newTime, setNewTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const run = (work: () => Promise<{ status: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await work();
      if (result.status === "error") {
        setError(result.message ?? null);
      } else {
        setError(null);
        after?.();
      }
    });

  const add = () =>
    run(
      () => addScheduleTimeAction(locationId, newTime),
      () => {
        setAdding(false);
        setNewTime("");
      },
    );

  return (
    <section
      aria-label={name}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-[18px]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">{name}</h2>
        <button
          type="button"
          disabled
          title="بتنبني بالخطوة 7"
          className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-muted"
        >
          اطبع الفورم · قريباً
        </button>
      </div>
      <span className="text-[13px] text-muted">مواعيد الجرد اليومية</span>
      <ul className="flex flex-wrap gap-2">
        {times.map((t) => {
          const label = formatScheduleTime(t.timeOfDay);
          return (
            <li
              key={t.id}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-quiet ps-3 pe-1 text-[15px] font-semibold"
            >
              <span dir="ltr">{label}</span>
              <button
                type="button"
                disabled={isSaving}
                aria-label={`شيل موعد ${label}`}
                onClick={() => run(() => removeScheduleTimeAction(t.id))}
                className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-quiet-strong disabled:opacity-40"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          );
        })}
        {times.length === 0 && (
          <li className="text-sm text-warn-text">ما في مواعيد، فما في تذكير ولا «متأخر»</li>
        )}
        {!adding && (
          <li>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="h-9 rounded-full border border-dashed border-line-dashed px-3 text-[13px] text-muted"
            >
              + موعد
            </button>
          </li>
        )}
      </ul>
      {adding && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            type="time"
            required
            aria-label={`موعد جديد لـ ${name}`}
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="h-10 rounded-lg border border-line-strong px-2 text-[15px]"
          />
          <button
            type="submit"
            disabled={isSaving || !newTime}
            className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {isSaving ? "لحظة…" : "أضف"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            className="h-10 rounded-lg border border-line-strong px-3 text-sm"
          >
            رجوع
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
      <span className="text-[13px] text-muted">{note}</span>
    </section>
  );
}
