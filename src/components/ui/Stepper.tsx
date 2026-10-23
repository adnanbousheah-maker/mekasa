"use client";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  incrementLabel: string;
  decrementLabel: string;
  min?: number;
};

const stepButton =
  "flex size-12 shrink-0 items-center justify-center bg-quiet text-2xl text-ink active:bg-line disabled:text-line-strong";

/** عداد + و − متل شاشة تأكيد الجرد. الـ + على اليمين لأن الواجهة RTL. */
export function Stepper({ label, value, onChange, incrementLabel, decrementLabel, min = 0 }: Props) {
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
        <span role="status" aria-label={`${label}: ${value}`} className="text-[22px] font-bold tabular-nums">
          {value}
        </span>
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
