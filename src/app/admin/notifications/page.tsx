import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { PageHeader } from "@/features/admin/components/AdminBits";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { myNotifications } from "@/features/notifications/queries";

// مركز الإشعارات للإدارة
export default function AdminNotificationsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const items = await myNotifications(200);
  return (
    <>
      <PageHeader title="الإشعارات" subtitle="كل التنبيهات اللي وصلتك، مع رابط لكل شي" />
      <div className="max-w-3xl">
        <NotificationList key={new Date().toISOString()} items={items} />
      </div>
    </>
  );
}
