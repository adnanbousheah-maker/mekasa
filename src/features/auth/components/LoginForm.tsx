"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { login, type LoginState } from "../actions";
import { ADMIN_PIN_LENGTH, STAFF_PIN_LENGTH } from "../pin-length";
import { PinPad } from "./PinPad";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(login, undefined);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");

  const canSubmit = phone.trim().length > 0 && pin.length >= STAFF_PIN_LENGTH && !isPending;

  return (
    <form
      action={formAction}
      // الرمز بينمسح بعد كل محاولة، والرقم بيضل
      onSubmit={() => setPin("")}
      className="flex w-full flex-col items-center gap-6"
    >
      <div className="flex w-full flex-col gap-2">
        <label htmlFor="phone" className="text-sm text-muted">
          رقم الجوال
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="079 123 4567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-14 rounded-[14px] border border-line-strong bg-surface px-4 text-right text-xl text-ink outline-none placeholder:text-line-strong focus:border-ink"
        />
      </div>

      <PinPad value={pin} onChange={setPin} minLength={STAFF_PIN_LENGTH} maxLength={ADMIN_PIN_LENGTH} />
      <input type="hidden" name="pin" value={pin} />

      {state?.error && (
        <p
          role="alert"
          className="w-full rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-center text-[15px] text-danger-text"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={!canSubmit}>
        {isPending ? "عم ندخل…" : "دخول"}
      </Button>
      <span className="text-sm text-muted">نسيت الرمز؟ احكي مع المدير</span>
    </form>
  );
}
