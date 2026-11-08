import { FilterForm } from "@/features/admin/components/FilterForm";
import { listOptions } from "@/features/lists/queries";
import { applyRawFilter, rawFilter, toQuery } from "@/features/reports/filters";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { ExportButton, PageHeader } from "@/features/admin/components/AdminBits";
import { AddUnit, NewMaterialButton } from "@/features/raw/components/AdminRawControls";
import { RawImportButton } from "@/features/raw/components/RawImport";
import { amount, daysLeftLabel, daysTone } from "@/features/raw/logic";
import { listRawMaterials, recentRawMoves } from "@/features/raw/queries";
import { InlineField } from "@/features/settings/components/InlineField";
import { CategorySelect } from "@/features/lists/components/CategorySelect";
import { categoryChoices } from "@/features/lists/queries";
import { SavedSwitch } from "@/features/settings/components/SavedSwitch";
import { setMaterialActiveAction, updateMaterialMinAction } from "@/features/raw/actions";
import { canEdit, requireManager } from "@/features/auth/session";
import { DAY_NAMES, dayNumberOf } from "@/lib/day-number";
import { businessDate, formatClock } from "@/lib/time";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// design/admin/AdminRaw.dc.html
export default function AdminRawPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Raw searchParams={searchParams} />
    </Suspense>
  );
}

const KIND = {
  receipt: ["استلام", "bg-ok-soft text-ok-text"],
  issue: ["صرف", "bg-warn-chip text-warn-text"],
  count_adjustment: ["جرد", "bg-quiet-strong text-table-head-text"],
  opening_balance: ["جرد أول", "bg-quiet-strong text-table-head-text"],
  admin_correction: ["تصحيح", "bg-info-soft text-info-text"],
} as const;

const TONE = { danger: "text-danger-text", warn: "text-warn-text", ok: "text-ok-text" } as const;

async function Raw({ searchParams }: { searchParams: SearchParams }) {
  const editor = canEdit(await requireManager());
  const f = rawFilter(await searchParams);
  await connection();
  const [allMaterials, moves, categories, rawOptions] = await Promise.all([
    listRawMaterials(true),
    recentRawMoves(20),
    categoryChoices("raw_categories"),
    listOptions("raw_categories"),
  ]);
  const parentOf = new Map(rawOptions.map((c) => [c.id, c.parentId]));
  const materials = applyRawFilter(allMaterials, f, (id) => parentOf.get(id) ?? null);
  const query = toQuery({ ...f });
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const today = businessDate(new Date());
  const when = (at: string) => {
    const d = businessDate(new Date(at));
    return `${d === today ? "اليوم" : DAY_NAMES[dayNumberOf(d)]} ${formatClock(new Date(at))}`;
  };

  return (
    <>
      <PageHeader
        title="المواد الأولية"
        subtitle="الأيام المتبقية محسوبة من معدل الصرف بآخر 14 يوم"
        actions={
          <>
            <ExportButton href={`/admin/export/raw${query ? `?${query}` : ""}`} />
            {editor && <RawImportButton />}
            {editor && <NewMaterialButton />}
          </>
        }
      />
      <FilterForm
        action="/admin/raw"
        fields={[
          { kind: "text", name: "q", label: "الاسم أو الكود", value: f.q, placeholder: "طحين، R01…" },
          {
            kind: "select",
            name: "category",
            label: "التصنيف",
            value: f.category,
            options: categories.map((c) => ({ value: c.id, label: c.depth ? `↳ ${c.name}` : c.name })),
          },
          { kind: "check", name: "low", label: "تحت الحد الأدنى بس", value: f.low },
        ]}
        count={{ shown: materials.length, total: allMaterials.length }}
      />
      <div className="scroll-hint overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              {[
                "المادة",
                "التصنيف",
                "الموجود",
                "الحد الأدنى",
                "صرف يومي",
                "بيكفي",
                "التحويلات",
                "آخر استلام",
                "فعّالة",
              ].map((h, i) => (
                <th key={h} scope="col" className={`px-3 py-3 font-semibold ${i === 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const tone = daysTone(m.daysLeft);
              return (
                <tr
                  key={m.id}
                  className={`border-t border-line-soft ${m.belowMin && m.isActive ? "bg-warn-soft" : ""} ${m.isActive ? "" : "opacity-60"}`}
                >
                  <th scope="row" className="px-3 py-2.5 text-right font-semibold">
                    {m.name}
                    {m.code && (
                      <span dir="ltr" className="ms-2 text-xs font-normal text-muted">
                        {m.code}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2.5 text-center">
                    {editor ? (
                      <CategorySelect
                        target="raw"
                        itemId={m.id}
                        itemName={m.name}
                        value={m.categoryId}
                        choices={categories}
                      />
                    ) : (
                      <span className="text-[13px] text-muted">
                        {(m.categoryId && categoryName.get(m.categoryId)) || "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold tabular-nums">
                    {amount(m.qty, m.baseUnit)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1">
                      {editor ? (
                        <InlineField
                          numeric
                          label={`الحد الأدنى لـ ${m.name}`}
                          initial={String(m.minQty)}
                          onSave={updateMaterialMinAction.bind(null, m.id)}
                          className="w-16"
                        />
                      ) : (
                        <span className="tabular-nums">{m.minQty}</span>
                      )}
                      <span className="text-xs text-muted">{m.baseUnit}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {m.dailyIssue ? amount(m.dailyIssue, m.baseUnit) : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-center font-bold ${tone ? TONE[tone] : "text-muted"}`}>
                    {daysLeftLabel(m.daysLeft) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[13px]">
                    <span className="flex flex-col items-center gap-1">
                      {m.units.map((u) => (
                        <span key={u.id}>
                          {u.name} = {amount(u.factor, m.baseUnit)}
                        </span>
                      ))}
                      {editor && <AddUnit materialId={m.id} baseUnit={m.baseUnit} />}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-[13px] text-muted">
                    {m.lastReceipt
                      ? `${when(m.lastReceipt.at)} · ${m.lastReceipt.enteredQty && m.lastReceipt.unitName ? `${m.lastReceipt.enteredQty} ${m.lastReceipt.unitName}` : amount(m.lastReceipt.qtyBase, m.baseUnit)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {editor ? (
                      <SavedSwitch
                        size="sm"
                        label={`${m.name} فعّالة`}
                        initial={m.isActive}
                        onSave={setMaterialActiveAction.bind(null, m.id)}
                      />
                    ) : m.isActive ? (
                      "✓"
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[17px] font-bold">آخر الحركات</h2>
        {moves.length === 0 && <span className="text-sm text-muted">ما في حركات لسا.</span>}
        {moves.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 text-sm last:border-b-0"
          >
            <span className={`rounded-[10px] px-2.5 py-0.5 text-xs font-semibold ${KIND[m.kind][1]}`}>
              {KIND[m.kind][0]}
            </span>
            <span className="grow">
              {m.materialName} ·{" "}
              {m.enteredQty && m.unitName
                ? `${m.enteredQty} ${m.unitName} (${amount(Math.abs(m.qtyBase), m.baseUnit)})`
                : amount(Math.abs(m.qtyBase), m.baseUnit)}
              {m.kind === "count_adjustment"
                ? ` · فرق ${m.qtyBase > 0 ? "+" : "−"}${amount(Math.abs(m.qtyBase), m.baseUnit)}`
                : ""}
              {m.supplierName ? ` · ${m.supplierName}` : ""}
              {m.hasInvoice ? " · مع صورة فاتورة" : ""}
            </span>
            <span className="text-muted">
              {m.by} · {when(m.at)}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
