import { ProductName } from "@/components/ui/ProductName";
import { setProductActiveAction } from "../actions";
import type { ProductRow } from "../queries";
import { NewPackagingItem } from "./NewPackagingItem";
import { SavedSwitch } from "./SavedSwitch";

type Props = { items: ProductRow[]; stock: Map<string, number>; storeName: string | null };

/** مواد التغليف (بالحبة) وموجودها بالمستودع. الفروع بتطلبها من المستودع. */
export function PackagingTab({ items, stock, storeName }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted">
          {storeName
            ? `الفروع بتطلبها من ${storeName}، وأمين التغليف بيطلّعها وبيجرد المستودع. كلها بالحبة.`
            : "ما في مستودع تغليف فعّال."}
        </span>
        <NewPackagingItem />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                المادة
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                بالمستودع
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                فعّال
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted">
                  ما في مواد تغليف لسا.
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className={`border-t border-line-soft ${p.isActive ? "" : "bg-canvas"}`}>
                <th scope="row" className="px-3 py-2 text-right font-semibold">
                  <ProductName name={p.nameEn} />
                </th>
                <td className="px-2 py-2 text-center tabular-nums">{stock.get(p.id) ?? 0} حبة</td>
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
