import type { ReactNode } from "react";

/** إطار شاشات الموظفين على الجوال (مقاس التصميم 390). */
export function StaffScreen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pt-4 pb-6">{children}</main>
  );
}

export function StaffLoading() {
  return (
    <StaffScreen>
      <span className="m-auto text-muted">لحظة…</span>
    </StaffScreen>
  );
}
