"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-12 rounded-xl bg-ink px-6 text-[17px] font-semibold text-white print:hidden"
    >
      اطبع
    </button>
  );
}
