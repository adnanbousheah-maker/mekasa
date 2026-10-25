"use client";

/** طباعة الصفحة (الأزرار والقوائم مخفية بالطباعة بـ print:hidden). */
export function PrintButton({ label = "اطبع" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-12 items-center justify-center rounded-xl bg-ink px-5 font-semibold text-white print:hidden"
    >
      {label}
    </button>
  );
}
