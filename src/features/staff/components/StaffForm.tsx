"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createStaffAction, updateStaffAction, type StaffFormState } from "../actions";
import type { LocationOption } from "../queries";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, roleLocationProblem, type Role } from "../roles";
import { PinNotice } from "./PinNotice";

type Props = {
  locations: LocationOption[];
  existing?: { id: string; fullName: string; phone: string; locationId: string | null; roles: Role[] };
};

const field =
  "h-12 rounded-xl border border-line-strong bg-surface px-3 text-base outline-none focus:border-ink";

export function StaffForm({ locations, existing }: Props) {
  const action = existing ? updateStaffAction.bind(null, existing.id) : createStaffAction;
  const [state, formAction, isPending] = useActionState<StaffFormState, FormData>(action, undefined);

  // الحقول controlled مشان ما تنمسح إذا رجع خطأ
  const [fullName, setFullName] = useState(existing?.fullName ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [locationId, setLocationId] = useState(existing?.locationId ?? "");
  const [roles, setRoles] = useState<Role[]>(existing?.roles ?? []);

  // موظف جديد، أو موظف صار أدمن وأخذ رمز من 6 أرقام: الرمز بيبين مرة وحدة
  const newPin = state?.status === "created" || state?.status === "saved" ? state.pin : undefined;
  if ((state?.status === "created" || state?.status === "saved") && newPin) {
    return (
      <div className="flex max-w-md flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
        {state.status === "saved" && (
          <p className="text-[15px] text-muted">انحفظ. صار أدمن، فرمزه القديم بطل يشتغل وإله رمز جديد:</p>
        )}
        <PinNotice fullName={state.fullName} pin={newPin} />
        <Link
          href="/admin/staff"
          className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
        >
          رجوع للموظفين
        </Link>
      </div>
    );
  }

  const kind = locations.find((l) => l.id === locationId)?.kind ?? null;
  const hint = roles.length > 0 ? roleLocationProblem(roles, kind) : null;
  const toggleRole = (role: Role) =>
    setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]));

  return (
    <form
      action={formAction}
      className="flex max-w-xl flex-col gap-5 rounded-2xl border border-line bg-surface p-6"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">الاسم</span>
        <input
          name="fullName"
          required
          maxLength={80}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">رقم الجوال</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          required
          placeholder="079 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={`${field} text-right`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">الموقع</span>
        <select
          name="locationId"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className={field}
        >
          <option value="">بدون موقع (أدمن بس)</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">الأدوار</legend>
        {ROLES.map((role) => (
          <label
            key={role}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${roles.includes(role) ? "border-ink bg-quiet" : "border-line"}`}
          >
            <input
              type="checkbox"
              name="roles"
              value={role}
              checked={roles.includes(role)}
              onChange={() => toggleRole(role)}
              className="mt-1 size-4 accent-ink"
            />
            <span className="flex flex-col">
              <span className="font-semibold">{ROLE_LABELS[role]}</span>
              <span className="text-[13px] text-muted">{ROLE_DESCRIPTIONS[role]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {hint && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-text">{hint}</p>}
      {state?.status === "error" && (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-text"
        >
          {state.message}
        </p>
      )}
      {state?.status === "saved" && (
        <p role="status" className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok-text">
          انحفظ.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || Boolean(hint) || roles.length === 0}
          className="h-12 grow rounded-xl bg-ink text-[17px] font-semibold text-white disabled:opacity-40"
        >
          {isPending ? "لحظة…" : existing ? "حفظ التعديل" : "أضف الموظف"}
        </button>
        <Link
          href="/admin/staff"
          className="flex h-12 items-center rounded-xl border border-line-strong px-5"
        >
          رجوع
        </Link>
      </div>
      {!existing && (
        <p className="text-[13px] text-muted">
          الرمز بيتولد لحاله (4 أرقام، و6 للأدمن)، وبيبينلك مرة وحدة بعد الحفظ.
        </p>
      )}
    </form>
  );
}
