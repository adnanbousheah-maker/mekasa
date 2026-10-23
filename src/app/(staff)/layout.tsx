import { Suspense, type ReactNode } from "react";
import { requireStaff } from "@/features/auth/session";

// كل شاشات الموظفين جوا StaffGate: الموقوف أو اللي مش داخل ما بيشوف ولا شاشة.
// (كل عملية على السيرفر بتتأكد كمان لحالها، وRLS تحت الكل.)
export default function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5">
          <span className="text-muted">لحظة…</span>
        </main>
      }
    >
      <StaffGate>{children}</StaffGate>
    </Suspense>
  );
}

async function StaffGate({ children }: { children: ReactNode }) {
  await requireStaff();
  return children;
}
