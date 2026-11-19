"use client";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  incrementLabel: string;
  decrementLabel: string;
  min?: number;
  // الرقم بالنص بينكتب كمان (افتراضياً، طلب الاجتماع 18 نوفمبر). false = + و − بس.
  typed?: boolean;
};

const stepButton =
  "flex size-12 shrink-0 items-center justify-center bg-quiet text-2xl text-ink active:bg-line disabled:text-line-strong";

/** عداد + و − متل شاشة تأكيد الجرد. الـ + على اليمين لأن الواجهة RTL. */
export function Stepper({
  label,
  value,
  onChange,
  incrementLabel,
  decrementLabel,
  min = 0,
  typed = true,
}: Props) {
  const canDecrement = value > min;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] text-muted">{label}</span>
      <div className="flex h-12 items-center justify-between overflow-hidden rounded-xl border border-line-strong bg-surface">
        <button
          type="button"
          aria-label={incrementLabel}
          className={stepButton}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
        {typed ? (
          <NumberField label={label} value={value} min={min} onChange={onChange} />
        ) : (
          <span
            role="status"
            aria-label={`${label}: ${value}`}
            className="text-[22px] font-bold tabular-nums"
          >
            {value}
          </span>
        )}
        <button
          type="button"
          aria-label={decrementLabel}
          className={stepButton}
          disabled={!canDecrement}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
      </div>
    </div>
  );
}

/** خانة رقم بتنكتب (كيبورد أرقام بالجوال، والأرقام العربية بتتحول). بتختار كل الرقم لما تكبس عليها. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 99_999,
  className = "text-[22px]",
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const digits = e.target.value
          .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
          .replace(/\D/g, "");
        onChange(Math.max(min, Math.min(max, Number(digits || 0))));
      }}
      className={`w-full min-w-0 bg-transparent text-center font-bold tabular-nums outline-none ${className}`}
    />
  );
}
