import Link from "next/link";
import { BatchBadge } from "@/components/ui/BatchBadge";
import { DayBadge } from "@/components/ui/DayBadge";
import { Logo } from "@/components/ui/Logo";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import type { CurrentStaff } from "@/features/auth/session";
import { CountReminder } from "@/features/reminders/components/CountReminder";
import { EnableNotifications } from "@/features/reminders/components/EnableNotifications";
import type { OpenSlot } from "@/features/reminders/queries";
import { ROLE_LABELS } from "@/features/staff/roles";
import { batchLabel } from "@/lib/batch-label";
import { dayNumberOf } from "@/lib/day-number";
import { businessDate, formatLongDate, greetingFor } from "@/lib/time";
import { formatQuantity } from "@/lib/units";
import type { BranchHomeData, FactoryHomeData } from "../queries";
import {
  BoxIcon,
  CartIcon,
  ClipboardIcon,
  ListIcon,
  OvenIcon,
  ReturnIcon,
  TrashIcon,
  TruckIcon,
} from "./icons";
import { TaskLink } from "./TaskLink";

type Props = {
  staff: CurrentStaff;
  now: Date;
  slot?: OpenSlot | null;
  vapidPublicKey?: string | null;
  branch?: BranchHomeData | null;
  factory?: FactoryHomeData | null;
  // أمين التغليف (بأي موقع)
  packaging?: { storeName: string; pending: number } | null;
};

/** الرئيسية للفرع (design/branch/Main) وللمصنع (design/factory/FactoryHome). */
export function StaffHome({
  staff,
  now,
  slot = null,
  vapidPublicKey = null,
  branch = null,
  factory = null,
  packaging = null,
}: Props) {
  const today = businessDate(now);
  const day = dayNumberOf(today);
  const firstName = staff.fullName.split(" ")[0];
  const atFactory = staff.location?.kind === "factory";
  const atBranch = staff.location?.kind === "branch" && staff.roles.includes("branch_staff");
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
        ) : staff.location?.kind === "branch" ? (
          <p className="text-base text-muted">فرع {staff.location?.name}</p>
        ) : (
          <p className="text-base text-muted">{staff.location?.name}</p>
        )}
      </header>

      {slot && <CountReminder slot={slot} now={now} />}

      {atFactory && <FactoryTasks staff={staff} data={factory} />}
      {atBranch && <BranchTasks data={branch} />}
      {packaging && <PackagingTasks data={packaging} />}

      <div className="grow" />
      <EnableNotifications vapidPublicKey={vapidPublicKey} />
      <LogoutButton className="self-center" />
    </main>
  );
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-ink px-2 text-base font-bold text-white">
      {n}
    </span>
  );
}

function BranchTasks({ data }: { data: BranchHomeData | null }) {
  const incoming = data?.incoming ?? 0;
  return (
    <>
      {data && data.nearExpiry.length > 0 && (
        <Link
          href="/waste"
          className="flex items-center gap-3 rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-2.5"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 text-danger"
          >
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2 2M9 2h6" />
          </svg>
          <span className="flex grow flex-col text-danger-text">
            <strong className="text-[15px]">
              {data.nearExpiry.length}{" "}
              {data.nearExpiry.length >= 3 && data.nearExpiry.length <= 10 ? "أصناف" : "صنف"} قربت تخلص مدتها
            </strong>
            <span dir="auto" className="text-[13px]">
              {data.nearExpiry.slice(0, 4).join("، ")} · بيعهم أول
            </span>
          </span>
        </Link>
      )}
      {data && data.belowMin.length > 0 && (
        <Link
          href="/order"
          className="flex items-center gap-3 rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-2.5"
        >
          <span className="shrink-0 text-danger">
            <CartIcon size={24} />
          </span>
          <span className="flex grow flex-col text-danger-text">
            <strong className="text-[15px]">
              {data.belowMin.length}{" "}
              {data.belowMin.length >= 3 && data.belowMin.length <= 10 ? "أصناف" : "صنف"} تحت الحد الأدنى
            </strong>
            <span dir="auto" className="text-[13px]">
              {data.belowMin
                .slice(0, 3)
                .map((b) => `${b.name} ${formatQuantity(b.qty, b.piecesPerCake)}`)
                .join("، ")}{" "}
              · اطلب
            </span>
          </span>
        </Link>
      )}
      <nav aria-label="المهام" className="flex flex-col gap-3">
        <TaskLink href="/count" title="جرد" description="عدّ الكيك الموجود بالفرع" icon={<ClipboardIcon />} />
        <TaskLink
          href="/orders"
          title="استلام"
          description={
            incoming === 0
              ? "ما في شي بالطريق"
              : incoming === 1
                ? "طلبية وحدة بالطريق"
                : `${incoming} طلبيات بالطريق`
          }
          icon={<TruckIcon />}
          aside={<Badge n={incoming} />}
        />
        <TaskLink href="/order" title="طلب" description="اطلب كيك من المصنع" icon={<CartIcon />} />
        <TaskLink
          href="/order/packaging"
          title="تغليف"
          description="علب وأكياس من مستودع التغليف"
          icon={<BoxIcon />}
        />
      </nav>
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/waste"
          className="flex h-14 items-center justify-center gap-2 rounded-[14px] border border-line bg-surface text-base font-semibold"
        >
          <span className="text-danger">
            <TrashIcon size={20} />
          </span>
          تسجيل تالف
        </Link>
        <Link
          href="/orders"
          className="flex h-14 items-center justify-center gap-2 rounded-[14px] border border-line bg-surface text-base font-semibold"
        >
          <span className="text-muted">
            <ListIcon size={20} />
          </span>
          طلبياتي
        </Link>
      </div>
    </>
  );
}

function PackagingTasks({ data }: { data: { storeName: string; pending: number } }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[15px] font-semibold text-muted">{data.storeName}</h2>
      <div className="grid grid-cols-2 gap-2.5">
        <TaskLink
          variant="tile"
          href="/packaging"
          title="طلبات التغليف"
          icon={<ListIcon size={24} />}
          aside={<Badge n={data.pending} />}
        />
        <TaskLink
          variant="tile"
          href="/packaging/count"
          title="جرد المستودع"
          icon={<ClipboardIcon size={24} />}
        />
      </div>
    </section>
  );
}

function FactoryTasks({ staff, data }: { staff: CurrentStaff; data: FactoryHomeData | null }) {
  const isStorekeeper = staff.roles.includes("storekeeper");
  const isDispatcher = staff.roles.includes("dispatcher");
  const lastDay = data?.lastDay ?? [];
  // المواد الأولية لأمين المستودع بس (الإخراج ما بيفتح صفحتها)
  const rawBelowMin = isStorekeeper ? (data?.rawBelowMin ?? []) : [];
  const belowMin = data?.belowMin ?? [];

  return (
    <>
      {(lastDay.length > 0 || rawBelowMin.length > 0 || belowMin.length > 0) && (
        <section aria-label="تنبيهات" className="flex flex-col gap-2">
          {lastDay.slice(0, 3).map((b) => (
            <Link
              key={`${b.productName}-${b.productionDate}`}
              href={isDispatcher ? "/factory/requests" : "/count"}
              className="flex items-center gap-3 rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-2.5 text-danger-text"
            >
              <BatchBadge productionDate={b.productionDate} shelfLifeDays={b.shelfLifeDays} />
              <span className="flex flex-col">
                <strong className="text-[15px]">
                  دفعة {batchLabel(b.productionDate, b.shelfLifeDays).text} آخر يوم إلها
                </strong>
                <span dir="auto" className="text-[13px]">
                  {b.productName}: {formatQuantity(b.qty, b.piecesPerCake)} لازم تطلع اليوم
                </span>
              </span>
            </Link>
          ))}
          {belowMin.length > 0 && (
            <div className="flex items-center gap-3 rounded-[14px] border border-danger-line bg-danger-soft px-3.5 py-2.5 text-danger-text">
              <CartIcon size={24} />
              <span className="flex flex-col">
                <strong className="text-[15px]">
                  {belowMin.length} {belowMin.length >= 3 && belowMin.length <= 10 ? "أصناف" : "صنف"} بالمصنع
                  تحت الحد الأدنى
                </strong>
                <span dir="auto" className="text-[13px]">
                  {belowMin
                    .slice(0, 3)
                    .map((b) => `${b.name} ${formatQuantity(b.qty, b.piecesPerCake)}`)
                    .join("، ")}
                </span>
              </span>
            </div>
          )}
          {rawBelowMin.length > 0 && (
            <Link
              href="/factory/raw"
              className="flex items-center gap-3 rounded-[14px] border border-warn-line bg-warn-soft px-3.5 py-2.5 text-warn-text"
            >
              <BoxIcon size={24} />
              <span className="flex flex-col">
                <strong className="text-[15px]">
                  {rawBelowMin.length === 1
                    ? "مادة وحدة"
                    : rawBelowMin.length === 2
                      ? "مادتين"
                      : `${rawBelowMin.length} مواد`}{" "}
                  تحت الحد الأدنى
                </strong>
                <span className="text-[13px]">{rawBelowMin.slice(0, 4).join("، ")}</span>
              </span>
            </Link>
          )}
        </section>
      )}
      {isDispatcher && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold text-muted">الإخراج</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <TaskLink
              variant="tile"
              href="/factory/requests"
              title="طلبات الفروع"
              icon={<ListIcon size={24} />}
              aside={<Badge n={data?.pendingRequests ?? 0} />}
            />
            <TaskLink
              variant="tile"
              href="/factory/dispatch"
              title="إخراج جديد"
              icon={<TruckIcon size={24} />}
            />
            <TaskLink
              variant="tile"
              href="/factory/today"
              title="طلبيات اليوم"
              icon={<ClipboardIcon size={24} />}
            />
          </div>
        </section>
      )}
      {isStorekeeper && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold text-muted">المستودع</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <TaskLink
              variant="tile"
              href="/factory/production"
              title="تسجيل إنتاج"
              icon={<OvenIcon size={24} />}
            />
            {!isDispatcher && (
              <TaskLink
                variant="tile"
                href="/factory/today"
                title="طلبيات اليوم"
                icon={<ClipboardIcon size={24} />}
              />
            )}
            <TaskLink variant="tile" href="/count" title="جرد المصنع" icon={<ClipboardIcon size={24} />} />
            <TaskLink
              variant="tile"
              href="/factory/raw"
              title="المواد الأولية"
              icon={<BoxIcon size={24} />}
            />
            <TaskLink
              variant="tile"
              href="/factory/raw/move"
              title="استلام وصرف مواد"
              icon={<TruckIcon size={24} />}
            />
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
            {data?.returnsEnabled && (
              <TaskLink
                variant="tile"
                href="/factory/returns"
                title="المرتجعات"
                icon={<ReturnIcon size={24} />}
                aside={<Badge n={data.openReturns} />}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}
