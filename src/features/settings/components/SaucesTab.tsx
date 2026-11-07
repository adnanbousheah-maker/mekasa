import { ProductName } from "@/components/ui/ProductName";
import { setProductActiveAction, updateProductNameArAction, updateProductNameEnAction } from "../actions";
import type { ProductRow } from "../queries";
import { InlineField } from "./InlineField";
import { NewSimpleItem } from "./NewSimpleItem";
import { SavedSwitch } from "./SavedSwitch";

/** الصوصات (بالحبة): الفروع بتطلبها من المصنع مع الكيك، وبتنعدّ بجرد آخر الشهر. */
export function SaucesTab({ items }: { items: ProductRow[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted">
          الفروع بتطلبها من المصنع مع الكيك، وبتنعدّ بجرد آخر الشهر. كلها بالحبة. الموقوف بيختفي من الطلب
          والجرد، وسجلاته القديمة بتضل.
        </span>
        <NewSimpleItem kind="sauce" />
      </div>
      <div className="scroll-hint overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                الصوص
              </th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">
                الاسم الثاني
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
                  ما في صوصات لسا. ضيف أول صوص من فوق.
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className={`border-t border-line-soft ${p.isActive ? "" : "bg-canvas"}`}>
                <th scope="row" className="px-3 py-2 text-right font-semibold">
                  <span className="sr-only">
                    <ProductName name={p.nameEn} />
                  </span>
                  <InlineField
                    label={`اسم ${p.nameEn}`}
                    initial={p.nameEn}
                    onSave={updateProductNameEnAction.bind(null, p.id)}
                    className="w-56 font-semibold"
                  />
                </th>
                <td className="px-2 py-2">
                  <InlineField
                    label={`الاسم الثاني لـ ${p.nameEn}`}
                    initial={p.nameAr ?? ""}
                    placeholder="اختياري"
                    onSave={updateProductNameArAction.bind(null, p.id)}
                    className="w-44"
                  />
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
