import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { PageHeader } from "@/features/admin/components/AdminBits";
import { requireAdmin } from "@/features/auth/session";
import { listAdminLocations } from "@/features/locations/queries";
import { loadDocuments } from "@/features/orders/queries";
import { belowMinByLocation, lastCountByLocation } from "@/features/reports/queries";
import { listStaff } from "@/features/staff/queries";
import { formatClock, formatLongDate } from "@/lib/time";

const KIND_LABELS = { branch: "فرع", factory: "مصنع", packaging: "مستودع" } as const;

// كل المواقع: افتح أي واحد بتشوف كل شي بخصه
export default function LocationsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Locations />
    </Suspense>
  );
}

async function Locations() {
  await requireAdmin();
  await connection();
  const [locations, below, lastCounts, staff, docs] = await Promise.all([
    listAdminLocations(),
    belowMinByLocation(),
    lastCountByLocation(),
    listStaff(),
    loadDocuments({
      requests: { statuses: ["pending_approval", "sent"] },
      dispatches: { statuses: ["in_transit"] },
      sinceDays: 14,
    }),
  ]);

  return (
    <>
      <PageHeader title="الفروع والمستودعات" subtitle="افتح أي موقع بتشوف كل شي بخصه" />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {locations.map((l) => {
          const low = below.find((b) => b.locationId === l.id)?.items.length ?? 0;
          const last = lastCounts.get(l.id);
          const people = staff.filter(
            (s) =>
              s.isActive &&
              (s.location?.id === l.id || (l.kind === "packaging" && s.roles.includes("packaging_keeper"))),
          ).length;
          const pending =
            l.kind === "branch"
              ? docs.requests.filter((r) => r.requestingLocationId === l.id).length
              : docs.requests.filter((r) => (l.kind === "packaging") === r.isPackaging).length;
          const road = docs.dispatches.filter((d) =>
            l.kind === "branch" ? d.toLocationId === l.id : d.fromLocationId === l.id,
          ).length;
          return (
            <li key={l.id}>
              <Link
                href={`/admin/locations/${l.id}`}
                aria-label={l.name}
                className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-ink"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-lg font-bold">{l.name}</span>
                  <span className="rounded-[10px] bg-quiet px-2.5 py-0.5 text-xs">{KIND_LABELS[l.kind]}</span>
                </span>
                {low > 0 && (
                  <span className="rounded-lg bg-danger-soft px-2.5 py-1 text-sm font-semibold text-danger-text">
                    {low} {low >= 3 && low <= 10 ? "أصناف" : "صنف"} تحت الحد الأدنى
                  </span>
                )}
                <span className="text-sm text-muted">
                  {l.kind === "branch" ? "طلبات مفتوحة" : "طلبات بانتظار الإخراج"}: {pending} · بالطريق:{" "}
                  {road}
                </span>
                <span className="text-sm text-muted">
                  {last
                    ? `آخر جرد ${formatLongDate(last.businessDate)} ${formatClock(new Date(last.startedAt))}`
                    : "ما في جرد لسا"}{" "}
                  · {people} {people === 1 ? "موظف" : "موظفين"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
