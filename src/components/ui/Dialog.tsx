"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** نافذة فوق الصفحة بـ <dialog> الأصلي (بيمسك التركيز وبيتسكر بـ Esc). */
export function Dialog({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-surface p-6 text-ink backdrop:bg-ink/40"
    >
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </dialog>
  );
}
