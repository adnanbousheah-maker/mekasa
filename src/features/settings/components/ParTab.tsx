import Link from "next/link";
import { ProductName } from "@/components/ui/ProductName";
import { DAY_NAMES, DAY_NUMBERS, type DayNumber } from "@/lib/day-number";
import { formatQuantity } from "@/lib/units";
import { setDailyMinAction, setMinLevelAction, setParLevelAction } from "../actions";
import { InlineField } from "./InlineField";

type Location = { id: string; name: string; kind: string };
type Product = { id: string; nameEn: string; piecesPerCake: number | null };

type Props = {
  locations: Location[];
  current: Location;
  products: Product[];
  par: Map<string, Map<string, number>>;
  min: Map<string, Map<string, number>>;
  // الفرع بس: [صنف][يوم] بالقطع
  daily: Map<string, Map<number, number>>;
  today: DayNumber;
  stock: Map<string, Map<string, number>>;
};

const KIND_NOTES: Record<string, string> = {
  branch:
    'المطلوب = كم بدك يكون بالفرع بعد الاستلام. الطلبية بتنقترح حسب استهلاك الفرع، وقبل ما يصير في جرودات كفاية حسب المطلوب. الأدنى = إذا الموجود نزل تحته بعد الجرد، بيوصل تنبيه للفرع وإلك. الأدنى إله رقم لكل يوم بالأسبوع، واليوم الفاضي بياخذ "كل الأيام".',
  factory: "الأدنى = إذا ستوك المصنع من هالصنف نزل تحته بعد الجرد، بيوصل تنبيه للمصنع وإلك.",
  packaging: "الأدنى بالحبة = إذا الموجود بالمستودع نزل تحته، بيوصل تنبيه لأمين التغليف وإلك.",
};

/** الحد المطلوب والأدنى، موقع موقع: كل فرع لحاله، والمصنع، ومستودع التغليف. */
export function ParTab({ locations, current, products, par, min, daily, today, stock }: Props) {
  const isBranch = current.kind === "branch";
  const isPackaging = current.kind === "packaging";

  return (
    <section className="flex flex-col gap-3">
      <nav aria-label="الموقع" className="flex flex-wrap gap-2">
        {locations.map((l) => (
          <Link
            key={l.id}
            href={`/admin/settings?tab=par&loc=${l.id}`}
            aria-current={l.id === current.id ? "page" : undefined}
            className={`flex h-11 items-center rounded-xl px-4 text-[15px] ${l.id === current.id ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
          >
            {l.kind === "branch" ? `فرع ${l.name}` : l.name}
          </Link>
        ))}
      </nav>
      <span className="text-sm leading-relaxed text-muted">{KIND_NOTES[current.kind]}</span>

      {/* مفتاح الموقع: الخانات بتحفظ قيمتها الأولى، فلازم تنعمل من جديد لما يتغير الموقع */}
      <div key={current.id} className="scroll-hint overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className={`w-full border-collapse text-sm ${isBranch ? "min-w-[980px]" : "min-w-[420px]"}`}>
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                الصنف
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                الموجود
              </th>
              {isBranch && (
                <th scope="col" className="px-3 py-3 font-semibold">
                  المطلوب
                </th>
              )}
              <th scope="col" className="px-3 py-3 font-semibold">
                {isBranch ? "الأدنى (كل الأيام)" : "الأدنى"}
              </th>
              {isBranch &&
                DAY_NUMBERS.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={`px-1.5 py-3 font-semibold ${d === today ? "text-ink underline decoration-brand decoration-2 underline-offset-4" : ""}`}
                  >
                    {DAY_NAMES[d]}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={isBranch ? 11 : 4} className="px-4 py-4 text-center text-muted">
                  {isPackaging ? "ما في مواد تغليف لسا. ضيفها من تبويب التغليف." : "ما في أصناف."}
                </td>
              </tr>
            )}
            {products.map((p) => {
              const toUnits = (pieces: number) =>
                p.piecesPerCake ? Math.round(pieces / p.piecesPerCake) : pieces;
              const have = stock.get(p.id)?.get(current.id) ?? 0;
              const general = min.get(p.id)?.get(current.id);
              const days = daily.get(p.id);
              // التنبيه بيقارن مع حد اليوم إذا موجود، وإلا العام (نفس v_below_min)
              const floor = days?.get(today) ?? general;
              const low = floor !== undefined && have < floor;
              return (
                <tr key={p.id} className={`border-t border-line-soft ${low ? "bg-danger-soft" : ""}`}>
                  <th scope="row" className="px-4 py-2 text-right font-semibold">
                    <ProductName name={p.nameEn} />
                    <span className="block text-xs font-normal text-muted">
                      {isPackaging ? "بالحبة" : p.piecesPerCake === null ? "بالقطع" : "بالكيكات"}
                    </span>
                  </th>
                  <td
                    className={`px-3 py-2 text-center tabular-nums ${low ? "font-semibold text-danger-text" : ""}`}
                  >
                    {isPackaging ? `${have} حبة` : formatQuantity(Math.max(0, have), p.piecesPerCake)}
                  </td>
                  {isBranch && (
                    <td className="px-3 py-1.5 text-center">
                      <InlineField
                        numeric
                        label={`الحد المطلوب لـ ${p.nameEn} بـ${current.name}`}
                        initial={String(toUnits(par.get(p.id)?.get(current.id) ?? 0))}
                        onSave={setParLevelAction.bind(null, current.id, p.id)}
                        className="w-16"
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-center">
                    <InlineField
                      numeric
                      label={`الحد الأدنى لـ ${p.nameEn} بـ${current.name}`}
                      initial={general === undefined ? "" : String(toUnits(general))}
                      placeholder="—"
                      onSave={setMinLevelAction.bind(null, current.id, p.id)}
                      className={isPackaging ? "w-20" : "w-16"}
                    />
                  </td>
                  {isBranch &&
                    DAY_NUMBERS.map((d) => {
                      const value = days?.get(d);
                      return (
                        <td key={d} className={`px-1 py-1.5 text-center ${d === today ? "bg-quiet" : ""}`}>
                          <InlineField
                            numeric
                            label={`الحد الأدنى لـ ${p.nameEn} بـ${current.name} يوم ${DAY_NAMES[d]}`}
                            initial={value === undefined ? "" : String(toUnits(value))}
                            placeholder={general === undefined ? "—" : String(toUnits(general))}
                            onSave={setDailyMinAction.bind(null, current.id, p.id, d)}
                            className="w-14"
                          />
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isBranch && (
        <span className="text-[13px] text-info-text">
          نصيحة: بعد أسبوعين من الجرد، شوف الاستهلاك الحقيقي بصفحة الستوك وعدّل الحد عليه.
        </span>
      )}
    </section>
  );
}
