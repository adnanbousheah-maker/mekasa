"use client";

import { useEffect } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  minLength: number;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

/**
 * لوحة أرقام كبيرة متل شاشة الدخول بالتصميم. النقاط 4، وبتزيد لـ 6 لما الأدمن يكمل.
 * على اللابتوب كمان بتقبل الأرقام من الكيبورد.
 */
export function PinPad({ value, onChange, maxLength, minLength }: Props) {
  const press = (key: string) => {
    if (key === "⌫") onChange(value.slice(0, -1));
    else if (key && value.length < maxLength) onChange(value + key);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (/^\d$/.test(event.key) && value.length < maxLength) onChange(value + event.key);
      if (event.key === "Backspace") onChange(value.slice(0, -1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [value, maxLength, onChange]);

  const dotCount = Math.max(minLength, value.length);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <span className="text-base font-semibold">الرمز السري</span>
        <div
          role="status"
          aria-label={`تم إدخال ${value.length} من ${minLength}`}
          className="flex gap-4"
          dir="ltr"
        >
          {Array.from({ length: dotCount }, (_, i) => (
            <span
              key={i}
              className={`size-[18px] rounded-full border-2 border-ink ${i < value.length ? "bg-ink" : "bg-transparent"}`}
            />
          ))}
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-3" dir="ltr">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} aria-hidden="true" />
          ) : (
            <button
              key={i}
              type="button"
              aria-label={key === "⌫" ? "مسح" : key}
              onClick={() => press(key)}
              className="h-16 rounded-2xl border border-line bg-surface font-sans text-[26px] font-semibold text-ink active:bg-quiet"
            >
              {key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
