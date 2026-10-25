import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { ProductName } from "@/components/ui/ProductName";
import { PageHeader } from "@/features/admin/components/AdminBits";
import { requireAdmin } from "@/features/auth/session";
import { listAdminLocations, locationItems, nearExpiryAt } from "@/features/locations/queries";
import { REQUEST_STATUS_LABELS } from "@/features/orders/components/OrderBits";
import { linesSummary } from "@/features/orders/logic";
import { loadDocuments } from "@/features/orders/queries";
import { addDays } from "@/features/reports/format";
import {
  consumptionSince,
  listCounts,
  listWaste,
  minLevels,
  parLevels,
  stockByProduct,
} from "@/features/reports/queries";
import { listStaff } from "@/features/staff/queries";
import { ROLE_LABELS } from "@/features/staff/roles";
import { WASTE_REASON_LABELS } from "@/features/waste/schemas";
import { businessDate, formatClock, formatLongDate } from "@/lib/time";
import { formatQuantity, formatQuantityCompact } from "@/lib/units";

type Params = Promise<{ id: string }>;

// كل شي بخص موقع واحد: الستوك والحدود، الطلبات، الجرد، التالف، والموظفين
export default function LocationPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Location params={params} />
    </Suspense>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const linkClass = "text-sm font-semibold text-info-text underline-offset-2 hover:underline";

async function Location({ params }: { params: Params }) {
  const { id } = await params;
  await requireAdmin();
  await connection();
  const locations = await listAdminLocations();
  const loc = locations.find((l) => l.id === id);
  if (!loc) {
    return (
      <>
        <PageHeader title="الموقع مش موجود" />
        <Link href="/admin/locations" className={linkClass}>
          رجوع للمواقع
        </Link>
      </>
    );
  }
  const today = businessDate(new Date());
  const isBranch = loc.kind === "branch";
  const isPackaging = loc.kind === "packaging";

  const [items, stock, par, min, use, near, docs, counts, waste, staff] = await Promise.all([
    locationItems(loc.kind),
    stockByProduct(),
    parLevels(),
    minLevels(),
    consumptionSince(addDays(today, -6)),
    isBranch ? nearExpiryAt(loc.id) : Promise.resolve(new Set<string>()),
    loadDocuments({
      requests: isBranch ? { requestingLocationId: loc.id } : { supplyingLocationId: loc.id },
      dispatches: isBranch ? { toLocationId: loc.id } : { fromLocationId: loc.id },
      sinceDays: 7,
    }),
    isPackaging ? Promise.resolve([]) : listCounts({ locationId: loc.id, limit: 5 }),
    listWaste("week"),
    listStaff(),
  ]);

  const qty = (pieces: number, ppc: number | null) =>
    isPackaging ? `${pieces} حبة` : formatQuantity(pieces, ppc);
  const lowCount = items.filter((p) => {
    const floor = min.get(p.id)?.get(loc.id);
    return floor !== undefined && (stock.get(p.id)?.get(loc.id) ?? 0) < floor;
  }).length;
  const people = staff.filter(
    (s) => s.location?.id === loc.id || (isPackaging && s.roles.includes("packaging_keeper")),
  );
  const localWaste = waste.rows.filter((w) => w.locationId === loc.id);
  const moves = [
    ...docs.requests.map((r) => {
      const d = docs.dispatches.find((x) => x.requestId === r.id);
      return {
        id: r.id,
        at: r.requestedAt,
        title: isBranch
          ? `${r.isPackaging ? "طلب تغليف" : "طلب"} ${formatLongDate(r.requestedAt.slice(0, 10))}`
          : `طلب ${r.fromName}`,
        summary: linesSummary(r.lines, r.isPackaging),
        status: d?.status === "in_transit" ? "بالطريق" : REQUEST_STATUS_LABELS[r.status],
      };
    }),
    ...docs.dispatches
      .filter((d) => !d.requestId)
      .map((d) => ({
        id: d.id,
        at: d.dispatchedAt,
        title: isBranch ? `من ${d.fromName} بدون طلب` : `إخراج لـ${d.toName} بدون طلب`,
        summary: linesSummary(d.lines, d.isPackaging),
        status: d.status === "in_transit" ? "بالطريق" : d.status === "received" ? "مستلم" : "ملغي",
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHeader
        title={isBranch ? `فرع ${loc.name}` : loc.name}
        subtitle={
          lowCount > 0
            ? `${lowCount} ${lowCount >= 3 && lowCount <= 10 ? "أصناف" : "صنف"} تحت الحد الأدنى`
            : "كل شي فوق الحد الأدنى"
        }
        actions={
          <Link
            href="/admin/locations"
            className="flex h-11 items-center rounded-xl border border-line-strong bg-surface px-4"
          >
            كل المواقع
          </Link>
        }
      />

      <Section
        title={isPackaging ? "مواد التغليف" : "الستوك والحدود"}
        action={
          <Link href={`/admin/settings?tab=par&loc=${loc.id}`} className={linkClass}>
            عدّل الحدود
          </Link>
        }
      >
        <div className="scroll-hint overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-sm">
            <thead>
              <tr className="bg-table-head text-table-head-text">
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  الصنف
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  الموجود
                </th>
                {isBranch && (
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    المطلوب
                  </th>
                )}
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  الأدنى
                </th>
                {!isPackaging && (
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    استهلاك 7 أيام
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const have = stock.get(p.id)?.get(loc.id) ?? 0;
                const floor = min.get(p.id)?.get(loc.id);
                const low = floor !== undefined && have < floor;
                const used = use.get(p.id)?.get(loc.id);
                return (
                  <tr key={p.id} className={`border-t border-line-soft ${low ? "bg-danger-soft" : ""}`}>
                    <th scope="row" className="px-3 py-2 text-right font-semibold">
                      <ProductName name={p.nameEn} />
                      {near.has(p.id) && (
                        <span className="ms-2 rounded-[8px] bg-warn-chip px-2 py-0.5 text-xs text-warn-text">
                          قرب يخلص
                        </span>
                      )}
                    </th>
                    <td
                      className={`px-3 py-2 text-center tabular-nums ${low ? "font-bold text-danger-text" : ""}`}
                    >
                      {qty(Math.max(0, have), p.piecesPerCake)}
                    </td>
                    {isBranch && (
                      <td className="px-3 py-2 text-center tabular-nums">
                        {qty(par.get(p.id)?.get(loc.id) ?? 0, p.piecesPerCake)}
                      </td>
                    )}
                    <td className="px-3 py-2 text-center tabular-nums">
                      {floor === undefined ? "—" : qty(floor, p.piecesPerCake)}
                    </td>
                    {!isPackaging && (
                      <td className="px-3 py-2 text-center text-muted tabular-nums">
                        {used ? formatQuantityCompact(used, p.piecesPerCake) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="الطلبات والإخراج (آخر 7 أيام)"
        action={
          loc.kind === "factory" ? (
            <Link href="/admin/orders/today" className={linkClass}>
              مجموع طلبات اليوم (للإنتاج)
            </Link>
          ) : undefined
        }
      >
        {moves.length === 0 ? (
          <p className="text-sm text-muted">ما في حركات.</p>
        ) : (
          <ul className="flex flex-col">
            {moves.slice(0, 15).map((m) => (
              <li key={m.id} className="border-t border-line-soft first:border-0">
                <Link
                  href={`/admin/orders?id=${m.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-quiet"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold">{m.title}</span>
                    <span className="text-[13px] text-muted">
                      {formatClock(new Date(m.at))} · {m.summary}
                    </span>
                  </span>
                  <span className="rounded-[10px] bg-quiet px-2.5 py-0.5 text-xs">{m.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!isPackaging && (
        <Section
          title="آخر الجرودات"
          action={
            <Link href={`/admin/counts?location=${loc.id}`} className={linkClass}>
              كل الجرودات
            </Link>
          }
        >
          {counts.length === 0 ? (
            <p className="text-sm text-muted">ما في جرد لسا.</p>
          ) : (
            <ul className="flex flex-col">
              {counts.map((c) => (
                <li key={c.id} className="border-t border-line-soft first:border-0">
                  <Link
                    href={`/admin/counts/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-quiet"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">
                        {formatLongDate(c.businessDate)} {formatClock(new Date(c.startedAt))}
                        {c.isOpening ? " · رصيد افتتاحي" : ""}
                      </span>
                      <span className="text-[13px] text-muted">
                        {c.countedBy} · {c.method === "photo" ? "بالصورة" : "يدوي"}
                        {isBranch && !c.isOpening ? ` · استهلاك ${c.consumedCakes} كيكة` : ""}
                      </span>
                    </span>
                    {c.impossibleLines > 0 && (
                      <span className="rounded-[10px] bg-danger-soft px-2.5 py-0.5 text-xs text-danger-text">
                        {c.impossibleLines} رقم مستحيل
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section
        title="التالف هالأسبوع"
        action={
          <Link href="/admin/waste" className={linkClass}>
            كل التالف
          </Link>
        }
      >
        {localWaste.length === 0 ? (
          <p className="text-sm text-muted">ما في تالف.</p>
        ) : (
          <ul className="flex flex-col">
            {localWaste.slice(0, 10).map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap justify-between gap-2 border-t border-line-soft py-2 first:border-0"
              >
                <span>
                  <ProductName name={w.productName} className="font-semibold" />{" "}
                  <span className="text-muted">· {WASTE_REASON_LABELS[w.reason]}</span>
                </span>
                <span className="text-sm text-muted">
                  {formatQuantityCompact(w.qtyPieces, w.piecesPerCake)} ·{" "}
                  {formatLongDate(w.occurredAt.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="الموظفين"
        action={
          <Link href="/admin/staff" className={linkClass}>
            إدارة الموظفين
          </Link>
        }
      >
        {people.length === 0 ? (
          <p className="text-sm text-muted">ما في موظفين.</p>
        ) : (
          <ul className="flex flex-col">
            {people.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap justify-between gap-2 border-t border-line-soft py-2 first:border-0"
              >
                <span className={`font-semibold ${s.isActive ? "" : "text-muted line-through"}`}>
                  {s.fullName}
                </span>
                <span className="text-sm text-muted">{s.roles.map((r) => ROLE_LABELS[r]).join("، ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
