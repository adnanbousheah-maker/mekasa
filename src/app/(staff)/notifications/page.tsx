import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { myNotifications } from "@/features/notifications/queries";

// مركز الإشعارات للموظفين
export default function NotificationsPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const items = await myNotifications();
  return (
    <StaffScreen>
      <ScreenHeader title="الإشعارات" subtitle="كل اللي وصلك، حتى لو ما بيّن عالجوال" />
      <NotificationList key={new Date().toISOString()} items={items} />
    </StaffScreen>
  );
}
