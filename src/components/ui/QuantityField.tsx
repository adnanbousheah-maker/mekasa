"use client";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  max?: number;
};

/** خانة رقم كبيرة للكميات الكبيرة (التغليف بالمية والألف)، بدل + و −. */
export function QuantityField({ label, value, onChange, max = 99_999 }: Props) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      value={value === 0 ? "" : String(value)}
      placeholder="0"
      onChange={(e) => {
        const digits = e.target.value
          .replace(/[^\d٠-٩]/g, "")
          .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
        onChange(Math.min(max, Number(digits || 0)));
      }}
      className="h-12 w-28 rounded-xl border border-line-strong bg-surface px-3 text-center text-[20px] font-bold tabular-nums"
    />
  );
}
