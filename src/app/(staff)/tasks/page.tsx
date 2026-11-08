import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { TaskChecklist } from "@/features/tasks/components/TaskChecklist";
import { myTasksToday } from "@/features/tasks/queries";

// المهام المتكررة (تنظيف، فحص حرارة…): مهام اليوم لموقع الموظف ودوره
export default function TasksPage() {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Tasks />
    </Suspense>
  );
}

async function Tasks() {
  const staff = await requireStaff();
  const tasks = await myTasksToday(staff);
  return (
    <StaffScreen>
      <ScreenHeader title="مهام اليوم" subtitle={staff.location?.name} />
      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">ما في مهام إلك اليوم.</p>
      ) : (
        <TaskChecklist key={new Date().toISOString()} tasks={tasks} />
      )}
    </StaffScreen>
  );
}
