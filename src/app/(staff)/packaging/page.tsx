import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { NotForYou, STATUS_TONES } from "@/features/orders/components/OrderBits";
import { allActiveProducts, loadDocuments } from "@/features/orders/queries";
import {
  isPackagingKeeper,
  packagingBelowMin,
  packagingStock,
  packagingStore,
} from "@/features/packaging/queries";
import { formatClock } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const units = (lines: { qtyPieces: number }[]) =>
  `${lines.length} ${lines.length >= 3 && lines.length <= 10 ? "أصناف" : "صنف"} · ${lines.reduce((n, l) => n + l.qtyPieces, 0)} حبة`;

// مستودع التغليف: طلبات الفروع، اللي بالطريق، والستوك
export default function PackagingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <Packaging searchParams={searchParams} />
    </Suspense>
  );
}

async function Packaging({ searchParams }: { searchParams: SearchParams }) {
  const { counted } = await searchParams;
  const staff = await requireStaff();
  if (!isPackagingKeeper(staff)) {
    return <NotForYou title="مستودع التغليف" text="هالشاشة لأمين التغليف." />;
  }
  await connection();
  const store = await packagingStore();
  if (!store) return <NotForYou title="مستودع التغليف" text="ما في مستودع تغليف فعّال." />;
  const [{ requests }, { dispatches }, items, stock, low] = await Promise.all([
    loadDocuments({ requests: { supplyingLocationId: store.id, statuses: ["sent"] }, sinceDays: 14 }),
    loadDocuments({ dispatches: { fromLocationId: store.id, statuses: ["in_transit"] }, sinceDays: 14 }),
    allActiveProducts("packaging"),
    packagingStock(store.id),
    packagingBelowMin(store.id),
  ]);

  return (
    <StaffScreen>
      <ScreenHeader title={store.name} subtitle="طلبات الفروع والإخراج والجرد" />
      {counted === "1" && (
        <p role="status" className="rounded-xl bg-ok-soft px-3 py-2.5 text-center text-ok-text">
          انحفظ جرد المستودع
        </p>
      )}

      {low.size > 0 && (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2.5 text-danger-text"
        >
          <strong>
            {low.size} {low.size >= 3 && low.size <= 10 ? "مواد" : "مادة"} تحت الحد الأدنى:
          </strong>{" "}
          <span dir="auto">
            {items
              .filter((i) => low.has(i.id))
              .map((i) => i.nameEn)
              .join("، ")}
          </span>
        </p>
      )}

      <h2 className="text-[15px] font-semibold text-muted">طلبات جديدة · بانتظار الإخراج</h2>
      {requests.length === 0 && <p className="text-sm text-muted">ما في طلبات جديدة.</p>}
      <ul className="flex flex-col gap-3">
        {[...requests].reverse().map((r) => (
          <li
            key={r.id}
            aria-label={`طلب فرع ${r.fromName}`}
            className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-bold">فرع {r.fromName}</span>
              <span className="text-sm text-muted">{formatClock(new Date(r.requestedAt))}</span>
            </div>
            <span className="text-sm text-muted">
              {units(r.lines)} · طلبها {r.requestedBy}
            </span>
            <Link
              href={`/packaging/dispatch?request=${r.id}`}
              className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white"
            >
              ابدأ الإخراج
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="text-[15px] font-semibold text-muted">طلعت · بانتظار الاستلام</h2>
      {dispatches.length === 0 && <p className="text-sm text-muted">ما في شي بالطريق.</p>}
      <ul className="flex flex-col gap-3">
        {dispatches.map((d) => (
          <li key={d.id} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-bold">فرع {d.toName}</span>
              <span
                className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES.in_transit}`}
              >
                بالطريق
              </span>
            </div>
            <span className="text-sm text-muted">
              طلع {formatClock(new Date(d.dispatchedAt))} · {units(d.lines)}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/packaging/count"
          className="flex h-14 items-center justify-center rounded-[14px] border border-line bg-surface text-base font-semibold"
        >
          جرد المستودع
        </Link>
        <Link
          href="/packaging/dispatch"
          className="flex h-14 items-center justify-center rounded-[14px] border border-line bg-surface text-base font-semibold"
        >
          إخراج بدون طلب
        </Link>
      </div>

      <section aria-label="الموجود بالمستودع" className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-muted">الموجود بالمستودع (حسب آخر جرد والحركات)</h2>
        <ul className="flex flex-col rounded-2xl border border-line bg-surface">
          {items.map((i) => (
            <li
              key={i.id}
              className={`flex justify-between gap-3 border-b border-line-soft px-4 py-2.5 last:border-0 ${low.has(i.id) ? "bg-danger-soft text-danger-text" : ""}`}
            >
              <ProductName name={i.nameEn} />
              <span className="font-semibold tabular-nums">
                {stock.get(i.id) ?? 0} حبة
                {low.has(i.id) && <span className="text-xs font-normal"> (الأدنى {low.get(i.id)})</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </StaffScreen>
  );
}
