import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = { title: "الدخول · ميكاسا" };

// design/branch/Login.dc.html
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-6 pt-14 pb-6">
      <div className="flex flex-col items-center gap-2">
        <Logo size="lg" priority />
        <h1 className="mt-2 text-2xl font-bold">أهلاً فيك</h1>
        <p className="text-base text-muted">ادخل رقم جوالك والرمز</p>
      </div>
      <LoginForm />
    </main>
  );
}
