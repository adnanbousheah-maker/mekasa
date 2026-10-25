import { ProductName } from "@/components/ui/ProductName";
import { setMinLevelAction, setParLevelAction } from "../actions";
import { InlineField } from "./InlineField";

type Props = {
  branches: { id: string; name: string }[];
  products: { id: string; nameEn: string; piecesPerCake: number | null }[];
  par: Map<string, Map<string, number>>;
  min: Map<string, Map<string, number>>;
};

/** design/admin/AdminSettings (الحد المطلوب بالفروع): بالكيكات، والأصناف اللي قطع بس بالقطع. */
export function ParTab({ branches, products, par, min }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <span className="text-sm leading-relaxed text-muted">
        الحد المطلوب = كم بدك يكون موجود من كل صنف بالفرع بعد الاستلام. التطبيق بيقترح على الفرع يطلب الفرق،
        وبيقترح على المصنع يطلّعه. الحد الأدنى (اختياري): إذا الموجود نزل تحته بعد الجرد أو الاستلام أو
        التالف، بيوصل تنبيه للفرع وإلك.
      </span>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                الصنف
              </th>
              {branches.map((b) => (
                <th key={b.id} scope="col" className="px-3 py-3 font-semibold">
                  {b.name}
                  <span className="block text-xs font-normal">المطلوب · الأدنى</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-line-soft">
                <th scope="row" className="px-4 py-2 text-right font-semibold">
                  <ProductName name={p.nameEn} />
                  <span className="block text-xs font-normal text-muted">
                    {p.piecesPerCake === null ? "بالقطع" : "بالكيكات"}
                  </span>
                </th>
                {branches.map((b) => {
                  const toUnits = (pieces: number) =>
                    p.piecesPerCake ? Math.round(pieces / p.piecesPerCake) : pieces;
                  const minPieces = min.get(p.id)?.get(b.id);
                  return (
                    <td key={b.id} className="px-3 py-1.5">
                      <div className="flex items-center justify-center gap-2">
                        <InlineField
                          numeric
                          label={`الحد المطلوب لـ ${p.nameEn} بـ${b.name}`}
                          initial={String(toUnits(par.get(p.id)?.get(b.id) ?? 0))}
                          onSave={setParLevelAction.bind(null, b.id, p.id)}
                          className="w-16"
                        />
                        <InlineField
                          numeric
                          label={`الحد الأدنى لـ ${p.nameEn} بـ${b.name}`}
                          initial={minPieces === undefined ? "" : String(toUnits(minPieces))}
                          placeholder="—"
                          onSave={setMinLevelAction.bind(null, b.id, p.id)}
                          className="w-14 bg-warn-soft"
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="text-[13px] text-info-text">
        نصيحة: بعد أسبوعين من الجرد، شوف الاستهلاك الحقيقي بصفحة الستوك وعدّل الحد عليه.
      </span>
    </section>
  );
}
