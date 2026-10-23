import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireStaff } from "@/features/auth/session";
import { StaffHome } from "@/features/home/components/StaffHome";
import { branchHomeData, factoryHomeData } from "@/features/home/queries";
import { getOpenSlot } from "@/features/reminders/queries";

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
  const counts = staff.roles.includes("branch_staff") || staff.roles.includes("storekeeper");
  const location = staff.location;
  const [slot, branch, factory] = await Promise.all([
    location && counts ? getOpenSlot(location.id) : null,
    location?.kind === "branch" ? branchHomeData(location.id) : null,
    location?.kind === "factory" ? factoryHomeData(location.id) : null,
  ]);
  return (
    <StaffHome
      staff={staff}
      now={new Date()}
      slot={slot}
      branch={branch}
      factory={factory}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
    />
  );
}

function HomeLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5">
      <span className="text-muted">لحظة…</span>
    </main>
  );
}
