type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
};

// design/admin/AdminSettings.dc.html: أخضر لما مفعّل، رمادي لما موقوف. الدائرة باتجاه البداية لما مفعّل (RTL).
const SIZES = {
  sm: { track: "h-6 w-11 p-0.5", knob: "size-5" },
  md: { track: "h-7 w-[52px] p-[3px]", knob: "size-[22px]" },
} as const;

export function Switch({ checked, onChange, label, disabled = false, size = "md" }: Props) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 ${s.track} ${checked ? "justify-start bg-ok" : "justify-end bg-switch-off"}`}
    >
      <span className={`rounded-full bg-surface ${s.knob}`} />
    </button>
  );
}
