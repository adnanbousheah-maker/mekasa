import Link from "next/link";
import { setOptionActiveAction, updateOptionNameAction, updateOptionTextAction } from "../field-actions";
import { InlineField } from "@/features/settings/components/InlineField";
import { SavedSwitch } from "@/features/settings/components/SavedSwitch";
import { COLOR_CHIP, treeOrder, type ListInfo, type ListOption } from "../types";
import {
  ColorSelect,
  DeleteOption,
  MoveButtons,
  NewOption,
  ParentSelect,
  RolesPicker,
} from "./OptionControls";

/**
 * القوائم: كل قائمة بنفس الشكل. إعادة تسمية، وصف، لون، أيقونة، ترتيب، تصنيف فرعي،
 * أدوار، إيقاف (التاريخ بيضل)، وحذف للي ما انستعمل بس.
 */
export function ListsTab({
  lists,
  current,
  options,
}: {
  lists: ListInfo[];
  current: ListInfo;
  options: ListOption[];
}) {
  const rows = treeOrder(options);
  const mains = options.filter((o) => !o.parentId);
  const siblingsOf = (o: ListOption) => rows.filter((r) => r.parentId === o.parentId);
  const isWaste = current.key === "waste_reasons";

  return (
    <section className="flex flex-col gap-3">
      <nav aria-label="القوائم" className="flex flex-wrap gap-1.5">
        {lists.map((l) => (
          <Link
            key={l.key}
            href={`/admin/settings?tab=lists&list=${l.key}`}
            aria-current={l.key === current.key ? "page" : undefined}
            className={`flex h-10 items-center rounded-[10px] px-3.5 text-sm ${l.key === current.key ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
          >
            {l.name}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="max-w-xl text-[13px] text-muted">
          {current.description} الموقوف بيختفي من الاختيار وسجلاته القديمة بتضل. الحذف بس للي ما انستعمل ولا
          مرة.
        </span>
        <NewOption listKey={current.key} label={current.name} />
      </div>

      <div className="scroll-hint overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-2 py-3 font-semibold">
                الترتيب
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                أيقونة
              </th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">
                الاسم
              </th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">
                الوصف
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                اللون
              </th>
              {current.allowsChildren && (
                <th scope="col" className="px-2 py-3 font-semibold">
                  مكانه
                </th>
              )}
              {current.allowsRoles && (
                <th scope="col" className="px-2 py-3 font-semibold">
                  مين بيختاره
                </th>
              )}
              {isWaste && (
                <th scope="col" className="px-2 py-3 font-semibold">
                  بدها ملاحظة
                </th>
              )}
              <th scope="col" className="px-2 py-3 font-semibold">
                مستعمل
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                فعّال
              </th>
              <th scope="col" className="px-2 py-3 font-semibold">
                <span className="sr-only">حذف</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-5 text-center text-muted">
                  القائمة فاضية. ضيف أول خيار من فوق.
                </td>
              </tr>
            )}
            {rows.map((o) => {
              const sibs = siblingsOf(o);
              const hasChildren = options.some((c) => c.parentId === o.id);
              return (
                <tr
                  key={o.id}
                  className={`border-t border-line-soft ${o.isActive ? "" : "bg-canvas opacity-70"}`}
                >
                  <td className="px-2 py-2 text-center">
                    <MoveButtons
                      id={o.id}
                      name={o.name}
                      first={sibs[0]?.id === o.id}
                      last={sibs[sibs.length - 1]?.id === o.id}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <InlineField
                      label={`أيقونة ${o.name}`}
                      initial={o.icon ?? ""}
                      placeholder="—"
                      onSave={updateOptionTextAction.bind(null, o.id, "icon")}
                      className="w-12 text-center"
                    />
                  </td>
                  <th scope="row" className={`px-2 py-2 text-right font-semibold ${o.depth ? "ps-8" : ""}`}>
                    <span className="flex items-center gap-1.5">
                      {o.depth === 1 && (
                        <span aria-hidden="true" className="text-muted">
                          ↳
                        </span>
                      )}
                      <span className="sr-only">{o.name}</span>
                      <InlineField
                        label={`اسم ${o.name}`}
                        initial={o.name}
                        onSave={updateOptionNameAction.bind(null, o.id)}
                        className={`w-40 font-semibold ${o.color ? COLOR_CHIP[o.color] : ""}`}
                      />
                    </span>
                  </th>
                  <td className="px-2 py-2">
                    <InlineField
                      label={`وصف ${o.name}`}
                      initial={o.description ?? ""}
                      placeholder="اختياري"
                      onSave={updateOptionTextAction.bind(null, o.id, "description")}
                      className="w-52"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <ColorSelect id={o.id} name={o.name} value={o.color} />
                  </td>
                  {current.allowsChildren && (
                    <td className="px-2 py-2 text-center">
                      {hasChildren ? (
                        <span className="text-xs text-muted">رئيسي (إله فروع)</span>
                      ) : (
                        <ParentSelect
                          id={o.id}
                          name={o.name}
                          value={o.parentId}
                          parents={mains.map((m) => ({ id: m.id, name: m.name }))}
                        />
                      )}
                    </td>
                  )}
                  {current.allowsRoles && (
                    <td className="px-2 py-2 text-center">
                      <RolesPicker id={o.id} name={o.name} value={o.allowedRoles} />
                    </td>
                  )}
                  {isWaste && (
                    <td className="px-2 py-2 text-center">
                      <SavedSwitch
                        size="sm"
                        label={`${o.name} بدها ملاحظة`}
                        initial={o.requiresNote}
                        onSave={setOptionActiveAction.bind(null, o.id, "requiresNote")}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2 text-center text-muted tabular-nums">{o.usageCount || "—"}</td>
                  <td className="px-2 py-2 text-center">
                    <SavedSwitch
                      size="sm"
                      label={`${o.name} فعّال`}
                      initial={o.isActive}
                      onSave={setOptionActiveAction.bind(null, o.id, "active")}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {o.usageCount === 0 && !o.code ? (
                      <DeleteOption id={o.id} name={o.name} />
                    ) : (
                      <span className="text-[11px] text-muted" title="مستعمل أو أساسي: وقّفه بدل الحذف">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
