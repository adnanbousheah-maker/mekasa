"use client";

/** بيبين لما الأرقام ترجع من المسودة (الصفحة تحدّثت بنص الجرد). */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-xl bg-info-soft px-3.5 py-2.5">
      <span className="grow text-[15px] text-info-text">
        رجّعنا الأرقام اللي كنت كاتبها. كمّل من وين ما وقفت.
      </span>
      <button
        type="button"
        onClick={onDiscard}
        className="h-12 shrink-0 rounded-xl border border-line-strong bg-surface px-3 text-sm"
      >
        ابدأ من جديد
      </button>
    </div>
  );
}
