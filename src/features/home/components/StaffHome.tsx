import { DayBadge } from "@/components/ui/DayBadge";
import { Logo } from "@/components/ui/Logo";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import type { CurrentStaff } from "@/features/auth/session";
import { ROLE_LABELS } from "@/features/staff/roles";
import { dayNumberOf } from "@/lib/day-number";
import { businessDate, formatLongDate, greetingFor } from "@/lib/time";
import { ClipboardIcon, TrashIcon } from "./icons";
import { TaskLink } from "./TaskLink";

type Props = {
  staff: CurrentStaff;
  now: Date;
};

/**
 * الرئيسية للفرع (design/branch/Main) وللمصنع (design/factory/FactoryHome).
 * بتعرض بس المهام اللي انبنت؛ الطلب والاستلام والإخراج والإنتاج والمواد بمراحلهم.
 */
export function StaffHome({ staff, now }: Props) {
  const today = businessDate(now);
  const day = dayNumberOf(today);
  const firstName = staff.fullName.split(" ")[0];
  const atFactory = staff.location?.kind === "factory";
  const factoryRoles = staff.roles.filter((r) => r === "dispatcher" || r === "storekeeper");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pt-5 pb-3">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Logo priority />
          <span className="flex items-center gap-1.5 text-sm text-muted">
            {formatLongDate(today)} · يوم <DayBadge day={day} size="sm" />
          </span>
        </div>
        <h1 className="mt-2 text-[26px] leading-tight font-bold">
          {greetingFor(now)}، {firstName}
        </h1>
        {atFactory ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="الموقع والأدوار">
            {[staff.location?.name, ...factoryRoles.map((r) => ROLE_LABELS[r])].map((label) => (
              <li key={label} className="rounded-[10px] bg-quiet-strong px-2.5 py-0.5 text-[13px] text-muted">
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-muted">فرع {staff.location?.name}</p>
        )}
      </header>

      {atFactory ? <FactoryTasks staff={staff} /> : <BranchTasks />}

      <div className="grow" />
      <LogoutButton className="self-center" />
    </main>
  );
}

function BranchTasks() {
  return (
    <nav aria-label="المهام" className="flex flex-col gap-3">
      <TaskLink href="/count" title="جرد" description="عدّ الكيك الموجود بالفرع" icon={<ClipboardIcon />} />
      <TaskLink
        href="/waste"
        title="تالف"
        description="سجّل كيك انكسر أو انتهت مدته"
        icon={
          <span className="text-danger">
            <TrashIcon />
          </span>
        }
      />
    </nav>
  );
}

function FactoryTasks({ staff }: { staff: CurrentStaff }) {
  const isStorekeeper = staff.roles.includes("storekeeper");
  const isDispatcher = staff.roles.includes("dispatcher");

  return (
    <>
      {isStorekeeper && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold text-muted">المستودع</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <TaskLink variant="tile" href="/count" title="جرد المصنع" icon={<ClipboardIcon size={24} />} />
            <TaskLink
              variant="tile"
              href="/waste"
              title="تالف"
              icon={
                <span className="text-danger">
                  <TrashIcon size={24} />
                </span>
              }
            />
          </div>
        </section>
      )}
      {isDispatcher && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold text-muted">الإخراج</h2>
          <p className="rounded-[14px] border border-line bg-surface px-4 py-3 text-sm text-muted">
            طلبات الفروع والإخراج جايين بالمرحلة الثانية.
          </p>
        </section>
      )}
    </>
  );
}
