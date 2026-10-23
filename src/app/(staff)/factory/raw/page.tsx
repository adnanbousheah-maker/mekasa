import Link from "next/link";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou } from "@/features/orders/components/OrderBits";
import { amount, daysLeftLabel } from "@/features/raw/logic";
import { listRawMaterials } from "@/features/raw/queries";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/factory/RawMaterials
export default function RawPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Raw searchParams={searchParams} />
    </Suspense>
  );
}

async function Raw({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const staff = await requireStaff();
  if (staff.location?.kind !== "factory" || !staff.roles.includes("storekeeper")) {
    return <NotForYou title="المواد الأولية" text="المواد الأولية لأمين المستودع." />;
  }
  const materials = await listRawMaterials();
  const tile =
    "flex h-12 items-center justify-center rounded-xl border border-line-strong bg-surface font-semibold";
  return (
    <StaffScreen>
      <ScreenHeader title="المواد الأولية" />
      {(params.saved === "1" || params.counted === "1") && (
        <div
          role="status"
          className="rounded-xl border border-ok bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-text"
        >
          {params.counted === "1" ? "انحفظ جرد المواد" : "انحفظت الحركة"}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/factory/raw/move?kind=receipt" className={tile}>
          استلام
        </Link>
        <Link href="/factory/raw/move?kind=issue" className={tile}>
          صرف
        </Link>
        <Link href="/factory/raw/count" className={tile}>
          جرد
        </Link>
      </div>
      <ul className="flex flex-col gap-2.5">
        {materials.map((m) => {
          const pct = Math.min(100, Math.round((m.qty / Math.max(m.minQty * 2, 1)) * 100));
          const days = daysLeftLabel(m.daysLeft);
          return (
            <li
              key={m.id}
              aria-label={m.name}
              className={`flex flex-col gap-2 rounded-[14px] bg-surface px-3.5 py-3 ${m.belowMin ? "border-2 border-warn-edge" : "border border-line"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">{m.name}</span>
                <span className="text-base font-bold tabular-nums">{amount(m.qty, m.baseUnit)}</span>
              </div>
              <div className="h-1.5 rounded bg-quiet">
                <div
                  className={`h-1.5 rounded ${m.belowMin ? "bg-warn" : "bg-ok"}`}
                  style={{ width: `${Math.max(0, pct)}%` }}
                />
              </div>
              <span className={`text-[13px] ${m.belowMin ? "font-semibold text-warn-text" : "text-muted"}`}>
                {m.belowMin
                  ? `تحت الحد الأدنى (${amount(m.minQty, m.baseUnit)})`
                  : `الحد الأدنى ${amount(m.minQty, m.baseUnit)}`}
                {days ? ` · بيكفي ${days}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </StaffScreen>
  );
}
