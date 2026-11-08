import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireStaff } from "@/features/auth/session";
import { StaffHome } from "@/features/home/components/StaffHome";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { branchHomeData, factoryHomeData } from "@/features/home/queries";
import { isPackagingKeeper, packagingStore, pendingPackagingRequests } from "@/features/packaging/queries";
import { getMonthlyCountsDue, getOpenSlot } from "@/features/reminders/queries";
import { myTasksToday } from "@/features/tasks/queries";

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
  if (staff.roles.includes("admin") || staff.roles.includes("general_manager")) redirect("/admin");
  const counts = staff.roles.includes("branch_staff") || staff.roles.includes("storekeeper");
  const location = staff.location;
  const [slot, monthly, branch, factory, packaging, tasks] = await Promise.all([
    location && counts ? getOpenSlot(location.id) : null,
    getMonthlyCountsDue(staff.roles),
    location?.kind === "branch" ? branchHomeData(location.id) : null,
    location?.kind === "factory" ? factoryHomeData(location.id) : null,
    isPackagingKeeper(staff) ? packagingHome() : null,
    myTasksToday(staff),
  ]);
  return (
    <StaffHome
      staff={staff}
      now={new Date()}
      slot={slot}
      monthly={monthly}
      branch={branch}
      factory={factory}
      packaging={packaging}
      tasks={{
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done").length,
        late: tasks.filter((t) => t.status === "late").length,
      }}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      bell={
        <Suspense fallback={null}>
          <NotificationBell href="/notifications" />
        </Suspense>
      }
    />
  );
}

async function packagingHome() {
  const store = await packagingStore();
  return store ? { storeName: store.name, pending: await pendingPackagingRequests(store.id) } : null;
}

function HomeLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5">
      <span className="text-muted">لحظة…</span>
    </main>
  );
}
