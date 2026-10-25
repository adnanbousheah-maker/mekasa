import { ProductName } from "@/components/ui/ProductName";
import {
  setProductActiveAction,
  updateProductNameArAction,
  updateProductPiecesAction,
  updateProductShelfLifeAction,
  updateSettingAction,
} from "../actions";
import type { ProductRow } from "../queries";
import { SELL_MODE_LABELS } from "../schemas";
import { InlineField } from "./InlineField";
import { NewProductDialog } from "./NewProductDialog";
import { SavedSwitch } from "./SavedSwitch";

type Props = { products: ProductRow[]; defaultPieces: number; defaultShelfLife: number };

export function ProductsTab({ products, defaultPieces, defaultShelfLife }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            عدد القطع بالكيكة (لكل الأصناف)
            <InlineField
              numeric
              label="عدد القطع العام"
              initial={String(defaultPieces)}
              onSave={updateSettingAction.bind(null, "default_pieces_per_cake")}
              className="h-10 w-16 border-ink text-[15px]"
            />
          </span>
          <span className="text-[13px] text-muted">وأي صنف بتقدر تعطيه رقم خاص بالجدول</span>
        </div>
        <NewProductDialog defaultPieces={defaultPieces} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="w-14 p-3">
                <span className="sr-only">صورة</span>
              </th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">
                الاسم
              </th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">
                الاسم بالعربي
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                النوع
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                قطع بالكيكة
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                مدة الحياة بالمصنع
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                فعّال
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={`border-t border-line-soft ${p.isActive ? "" : "bg-canvas"}`}>
                <td className="px-3 py-2">
                  <span
                    role="img"
                    aria-label="صورة الصنف"
                    className="block size-10 rounded-lg bg-quiet-strong"
                  />
                </td>
                <th scope="row" className="px-2 py-2 text-right font-semibold">
                  <ProductName name={p.nameEn} />
                </th>
                <td className="px-2 py-2">
                  <InlineField
                    label={`الاسم بالعربي لـ ${p.nameEn}`}
                    initial={p.nameAr ?? ""}
                    placeholder="[الاسم بالعربي]"
                    onSave={updateProductNameArAction.bind(null, p.id)}
                    className="w-40"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="rounded-[10px] bg-quiet px-2.5 py-1 text-[13px]">
                    {SELL_MODE_LABELS[p.sellMode]}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  {p.sellMode === "pieces_only" ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="inline-flex flex-col items-center">
                      <InlineField
                        numeric
                        label={`قطع بالكيكة لـ ${p.nameEn}`}
                        initial={p.piecesPerCake === null ? "" : String(p.piecesPerCake)}
                        placeholder={String(defaultPieces)}
                        onSave={updateProductPiecesAction.bind(null, p.id)}
                        className="w-14"
                      />
                      <span className="text-[11px] text-muted">
                        {p.piecesPerCake === null ? "العام" : "خاص"}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex flex-col items-center">
                    <InlineField
                      numeric
                      label={`مدة الحياة لـ ${p.nameEn}`}
                      initial={p.shelfLifeDays === null ? "" : String(p.shelfLifeDays)}
                      placeholder={String(defaultShelfLife)}
                      onSave={updateProductShelfLifeAction.bind(null, p.id)}
                      className="w-14"
                    />
                    <span className="text-[11px] text-muted">
                      {(p.shelfLifeDays ?? defaultShelfLife) > 7 ? "بالتاريخ" : "برقم اليوم"}
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  <SavedSwitch
                    size="sm"
                    label={`${p.nameEn} فعّال`}
                    initial={p.isActive}
                    onSave={setProductActiveAction.bind(null, p.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
