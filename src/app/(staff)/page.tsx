import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireStaff } from "@/features/auth/session";
import { StaffHome } from "@/features/home/components/StaffHome";

export default function HomePage() {
  // قراءة الجلسة لازم تكون جوا Suspense (cacheComponents)
  return (
    <Suspense fallback={<HomeLoading />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const staff = await requireStaff();
  if (staff.roles.includes("admin")) redirect("/admin");
  return <StaffHome staff={staff} now={new Date()} />;
}

function HomeLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5">
      <span className="text-muted">لحظة…</span>
    </main>
  );
}
