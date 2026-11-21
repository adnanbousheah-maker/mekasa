"use client";

import { SavedSwitch } from "@/features/settings/components/SavedSwitch";
import { endPreviewAction, resetOperationsAction, setFeatureAction } from "../actions";
import { END_PREVIEW_WORD, RESET_WORD } from "../words";
import { ConfirmWordAction } from "./ConfirmWordAction";
import { LocationCountReset } from "./LocationCountReset";

const card = "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5";

export function ItControls({
  previewMode,
  tasks,
  locations,
}: {
  previewMode: boolean;
  tasks: boolean;
  locations: { id: string; name: string; kind: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="المزايا" className={card}>
        <h2 className="text-[17px] font-bold">المزايا</h2>
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="font-semibold">المهام المتكررة</span>
            <span className="text-sm text-muted">
              لما تكون مطفية بتختفي عن الكل، حتى الأدمن. البيانات بتضل.
            </span>
          </span>
          <SavedSwitch
            label="المهام المتكررة"
            initial={tasks}
            states={{ on: "ظاهرة", off: "مخفية" }}
            onSave={(next) => setFeatureAction("tasks", next)}
          />
        </div>
      </section>

      <section aria-label="تصفير جرودات موقع" className={`${card} border-danger-line`}>
        <h2 className="text-[17px] font-bold text-danger-text">تصفير جرودات موقع</h2>
        <p className="text-[15px] text-muted">
          بيمسح جرودات موقع واحد وتعديلاتها (وبالمصنع بتختار: الكيك، أو المواد الأولية بس، أو الاثنين)،
          فالستوك بيرجع لحركاته بس (اللي وصله وطلع منه والتالف)، والجرد الجاي بيصير أول جرد.
        </p>
        <p className="text-[15px]">
          <strong>بيضل:</strong> الطلبات والإخراج والاستلام والإنتاج والتالف، وكل المواقع الثانية.
        </p>
        <LocationCountReset locations={locations} />
      </section>

      {previewMode ? (
        <>
          <section aria-label="تصفير النظام" className={`${card} border-danger-line`}>
            <h2 className="text-[17px] font-bold text-danger-text">تصفير النظام</h2>
            <p className="text-[15px] text-muted">
              بيمسح كل الشغل: الجرودات والستوك والحركات، الطلبات والإخراج والاستلام، الإنتاج والدفعات، التالف،
              المواد الأولية، المهام اللي انعملت، الإشعارات، محادثات المساعد، سجل التعديلات، والصور.
            </p>
            <p className="text-[15px]">
              <strong>بيضل:</strong> الموظفين، الأصناف، المواقع، الإعدادات، الحدود، مواعيد الجرد، القوائم،
              المواد الأولية، وقوالب المهام.
            </p>
            <ConfirmWordAction
              word={RESET_WORD}
              label="ما في رجعة. للتأكيد"
              buttonLabel="صفّر النظام"
              doneMessage="انصفّر النظام"
              onConfirm={async (word) => {
                const result = await resetOperationsAction(word);
                if (result.status === "error") return result;
                return {
                  status: "done",
                  message:
                    result.photos === null
                      ? "انصفّر النظام. الصور ما انمسحت، اكبس كمان مرة لاحقاً."
                      : `انصفّر النظام وانمسحت ${result.photos} صورة`,
                };
              }}
            />
          </section>

          <section aria-label="فترة المعاينة" className={card}>
            <h2 className="text-[17px] font-bold">فترة المعاينة</h2>
            <p className="text-[15px] text-muted">
              لما يبلش الشغل الحقيقي، أنهي فترة المعاينة. بعدها زر التصفير بيتسكّر نهائياً، وما بيرجع.
            </p>
            <ConfirmWordAction
              word={END_PREVIEW_WORD}
              label="للتأكيد"
              buttonLabel="أنهِ فترة المعاينة"
              doneMessage="خلصت فترة المعاينة"
              onConfirm={endPreviewAction}
            />
          </section>
        </>
      ) : (
        <section aria-label="فترة المعاينة" className={card}>
          <h2 className="text-[17px] font-bold">فترة المعاينة خلصت</h2>
          <p className="text-[15px] text-muted">النظام بالشغل الحقيقي، وزر التصفير مسكّر نهائياً.</p>
        </section>
      )}
    </div>
  );
}
