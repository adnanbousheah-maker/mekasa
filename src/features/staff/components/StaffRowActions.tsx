"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { resetPinAction, setStaffActiveAction } from "../actions";
import { PinNotice } from "./PinNotice";

type Props = {
  staffId: string;
  fullName: string;
  isActive: boolean;
  isSelf: boolean;
};

type Pending = { kind: "confirm-pin" } | { kind: "confirm-active" } | { kind: "pin"; pin: string } | null;

const small = "h-[34px] rounded-lg border bg-surface px-2.5 text-[13px] disabled:opacity-40";

export function StaffRowActions({ staffId, fullName, isActive, isSelf }: Props) {
  const [dialog, setDialog] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, startTransition] = useTransition();

  const resetPin = () =>
    startTransition(async () => {
      const result = await resetPinAction(staffId);
      if (result.status === "error") {
        setError(result.message);
        setDialog(null);
      } else {
        setError(null);
        setDialog({ kind: "pin", pin: result.pin });
      }
    });

  const toggleActive = () =>
    startTransition(async () => {
      const result = await setStaffActiveAction(staffId, !isActive);
      setError(result.status === "error" ? result.message : null);
      setDialog(null);
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Link
        href={`/admin/staff/${staffId}`}
        className={`${small} inline-flex items-center border-line-strong`}
      >
        تعديل
      </Link>
      <button
        type="button"
        className={`${small} border-line-strong`}
        onClick={() => setDialog({ kind: "confirm-pin" })}
      >
        رمز جديد
      </button>
      {!isSelf && (
        <button
          type="button"
          className={`${small} ${isActive ? "border-danger-line text-danger-text" : "border-ok text-ok-text"}`}
          onClick={() => setDialog({ kind: "confirm-active" })}
        >
          {isActive ? "إيقاف" : "تفعيل"}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-left text-xs text-danger-text">
          {error}
        </p>
      )}

      <Dialog open={dialog?.kind === "confirm-pin"} onClose={() => setDialog(null)} title="رمز دخول جديد">
        <p className="mb-5 text-[15px] text-muted">
          الرمز القديم لـ {fullName} رح يبطل يشتغل، والقفل (إذا مقفول) رح ينفك.
        </p>
        <DialogButtons
          onCancel={() => setDialog(null)}
          onConfirm={resetPin}
          confirmLabel="اعمل رمز جديد"
          isWorking={isWorking}
        />
      </Dialog>

      <Dialog
        open={dialog?.kind === "confirm-active"}
        onClose={() => setDialog(null)}
        title={isActive ? `إيقاف ${fullName}` : `تفعيل ${fullName}`}
      >
        <p className="mb-5 text-[15px] text-muted">
          {isActive
            ? "رح يطلع من كل الأجهزة فوراً وما بيقدر يدخل. حركاته القديمة بتضل باسمه."
            : "رح يقدر يدخل برمزه الحالي."}
        </p>
        <DialogButtons
          onCancel={() => setDialog(null)}
          onConfirm={toggleActive}
          confirmLabel={isActive ? "إيقاف" : "تفعيل"}
          isWorking={isWorking}
          isDanger={isActive}
        />
      </Dialog>

      <Dialog open={dialog?.kind === "pin"} onClose={() => setDialog(null)} title="الرمز الجديد">
        {dialog?.kind === "pin" && <PinNotice fullName={fullName} pin={dialog.pin} />}
        <button
          type="button"
          className="mt-5 h-12 w-full rounded-xl bg-ink text-[17px] font-semibold text-white"
          onClick={() => setDialog(null)}
        >
          تمام، أعطيته الرمز
        </button>
      </Dialog>
    </div>
  );
}

function DialogButtons({
  onCancel,
  onConfirm,
  confirmLabel,
  isWorking,
  isDanger = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  isWorking: boolean;
  isDanger?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isWorking}
        onClick={onConfirm}
        className={`h-12 grow rounded-xl text-[17px] font-semibold text-white disabled:opacity-50 ${isDanger ? "bg-danger" : "bg-ink"}`}
      >
        {isWorking ? "لحظة…" : confirmLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-12 rounded-xl border border-line-strong px-5 text-[17px]"
      >
        رجوع
      </button>
    </div>
  );
}
