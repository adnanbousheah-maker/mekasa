import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BatchBadge } from "@/components/ui/BatchBadge";
import { ProductName } from "@/components/ui/ProductName";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffLoading, StaffScreen } from "@/components/ui/StaffScreen";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { businessDate, formatClock, formatLongDate } from "@/lib/time";
import { formatQuantityCompact } from "@/lib/units";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f-]{36}$/i;

// جرد مصنع واحد لمسؤول المصنع: لكل دفعة المتوقع والمعدود والفرق (بعد الجرد، مش وقته)
export default function FactoryCountPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<StaffLoading />}>
      <FactoryCount params={params} />
    </Suspense>
  );
}

async function FactoryCount({ params }: { params: Params }) {
  const { id } = await params;
  const staff = await requireStaff();
  if (!staff.roles.includes("factory_manager") || staff.location?.kind !== "factory" || !UUID.test(id)) {
    redirect("/");
  }
  const supabase = await createClient();
  const [{ data: count }, { data: lines }, { data: products }] = await Promise.all([
    supabase
      .from("stock_counts")
      .select("id, started_at, location_id, is_opening, scope")
      .eq("id", id)
      .eq("location_id", staff.location.id)
      .maybeSingle(),
    supabase.rpc("count_breakdown", { p_count_id: id }),
    supabase.from("v_products").select("id, name_en, sort_order, effective_shelf_life_days"),
  ]);
  if (!count) redirect("/factory/report");
  const batchIds = [...new Set((lines ?? []).flatMap((l) => (l.batch_id ? [l.batch_id] : [])))];
  const { data: batches } = batchIds.length
    ? await supabase.from("batches").select("id, production_date, is_frozen").in("id", batchIds)
    : { data: [] };
  const productOf = new Map((products ?? []).map((p) => [p.id!, p]));
  const batchOf = new Map((batches ?? []).map((b) => [b.id, b]));
  const rows = (lines ?? [])
    .filter((l) => l.counted_qty !== 0 || l.expected_qty !== 0)
    .map((l) => ({
      ...l,
      product: productOf.get(l.product_id),
      batch: l.batch_id ? batchOf.get(l.batch_id) : undefined,
    }))
    .sort(
      (a, b) =>
        (a.product?.sort_order ?? 0) - (b.product?.sort_order ?? 0) ||
        (a.batch?.production_date ?? "").localeCompare(b.batch?.production_date ?? ""),
    );
  const q = (n: number, ppc: number | null) => (n === 0 ? "0" : formatQuantityCompact(n, ppc));

  return (
    <StaffScreen>
      <ScreenHeader
        title={`جرد ${count.scope === "sauce" ? "الصوصات" : "المصنع"}`}
        subtitle={`${formatLongDate(businessDate(new Date(count.started_at)))} · ${formatClock(new Date(count.started_at))}${count.is_opening ? " · أول جرد" : ""}`}
        backHref="/factory/report"
      />
      <p className="text-sm text-muted">
        المتوقع = الجرد اللي قبله + الإنتاج − اللي طلع − التالف. الفرق بالأحمر ناقص، وبالأزرق زيادة.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted">ما في أسطر بهالجرد.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((l) => {
            const diff = (l.counted_qty ?? 0) - (l.expected_qty ?? 0);
            const ppc = l.pieces_per_cake;
            return (
              <li
                key={l.line_id}
                className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5"
              >
                {l.batch && (
                  <BatchBadge
                    productionDate={l.batch.production_date}
                    shelfLifeDays={l.product?.effective_shelf_life_days ?? 7}
                    frozen={l.batch.is_frozen}
                    size="sm"
                  />
                )}
                <span className="flex min-w-0 grow flex-col">
                  <ProductName name={l.product?.name_en ?? ""} className="font-semibold" />
                  <span className="text-xs text-muted">
                    متوقع {q(l.expected_qty ?? 0, ppc)} · انعدّ {q(l.counted_qty ?? 0, ppc)}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${count.is_opening || diff === 0 ? "text-muted" : diff < 0 ? "text-danger-text" : "text-info-text"}`}
                >
                  {count.is_opening
                    ? "—"
                    : diff === 0
                      ? "مضبوط"
                      : `${diff > 0 ? "+" : "−"}${q(Math.abs(diff), ppc)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </StaffScreen>
  );
}
