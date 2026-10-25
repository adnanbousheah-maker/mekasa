import { updateSettingAction } from "../actions";
import type { AppSettings } from "../queries";
import type { NumberSetting, ToggleSetting } from "../schemas";
import { InlineField } from "./InlineField";
import { SavedSwitch } from "./SavedSwitch";

type Row =
  | { kind: "toggle"; key: ToggleSetting; title: string; sub: string; feminine?: boolean }
  | { kind: "number"; key: NumberSetting; title: string; sub: string; unit: string };

// design/admin/AdminSettings.dc.html، مع دقايق التذكير والتأخير (كانوا ملاحظة تحت مواعيد الجرد)
const ROWS: Row[] = [
  {
    kind: "toggle",
    key: "order_approval_required",
    title: "موافقة الأدمن على طلبات الفروع",
    sub: "إذا مفعّلة، الطلب ما بيوصل للمصنع إلا بعد موافقتك",
    feminine: true,
  },
  {
    kind: "number",
    key: "unreceived_alert_hours",
    title: "تنبيه الإخراج اللي ما انستلم",
    sub: "تنبيه للفرع ولإلك إذا ما انستلم خلال",
    unit: "ساعات",
  },
  {
    kind: "number",
    key: "factory_shelf_life_days",
    title: "مدة حياة الكيك بالمصنع",
    sub: "بعدها الدفعة بتتلون أحمر وبتطلع بالتنبيهات. أقصى شي 7 لأن رقم اليوم بيتكرر كل أسبوع",
    unit: "أيام",
  },
  {
    kind: "number",
    key: "branch_shelf_life_days",
    title: "مدة حياة الكيك بالفرع (للتقدير)",
    sub: "بنستعملها لنقدّر الكيك القديم بالفروع",
    unit: "أيام",
  },
  {
    kind: "number",
    key: "count_reminder_minutes_before",
    title: "التذكير قبل موعد الجرد",
    sub: "إشعار للموظفين قبل الموعد بـ",
    unit: "دقيقة",
  },
  {
    kind: "number",
    key: "count_late_after_minutes",
    title: "الجرد بيصير متأخر بعد",
    sub: "إذا ما انعمل الجرد خلال هالمدة من الموعد، بيطلع «متأخر»",
    unit: "دقيقة",
  },
  {
    kind: "toggle",
    key: "photo_count_enabled",
    title: "الجرد بالصورة",
    sub: "إذا موقوف، الموظفين بيجردوا يدوي بس",
  },
  {
    kind: "toggle",
    key: "factory_loose_pieces_enabled",
    title: "تطليع قطع من المصنع",
    sub: "إذا موقوف، المصنع بيطلّع كيكات كاملة بس، وخانة «قطع» بتختفي من الطلب والإخراج (الأصناف اللي قطع بس بتضل متل ما هي)",
  },
  {
    kind: "toggle",
    key: "branch_transfers_enabled",
    title: "التحويل بين الفروع",
    sub: "إخراج من فرع لفرع، مع استلام بالفرع الثاني",
  },
  {
    kind: "toggle",
    key: "returns_enabled",
    title: "الإرجاع من الفروع للمصنع",
    sub: "الكيك الراجع بيروح لخانة المرتجعات، وأمين المستودع بيقرر يرجع للستوك أو تالف",
  },
];

export function GeneralTab({ settings }: { settings: AppSettings }) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface px-5 py-2">
      {ROWS.map((row) => (
        <div
          key={row.key}
          className="flex flex-wrap items-center gap-4 border-b border-line-soft py-4 last:border-b-0"
        >
          <div className="flex flex-[1_1_280px] flex-col">
            <span className="text-[15px] font-semibold">{row.title}</span>
            <span className="text-[13px] text-muted">{row.sub}</span>
          </div>
          {row.kind === "toggle" ? (
            <SavedSwitch
              label={row.title}
              initial={settings[row.key]}
              onSave={updateSettingAction.bind(null, row.key)}
              states={row.feminine ? { on: "مفعّلة", off: "موقوفة" } : { on: "مفعّل", off: "موقوف" }}
            />
          ) : (
            <span className="inline-flex items-start gap-2">
              <InlineField
                numeric
                label={row.title}
                initial={String(settings[row.key])}
                onSave={updateSettingAction.bind(null, row.key)}
                className="h-10 w-20 text-[15px]"
              />
              <span className="pt-2 text-[15px] font-semibold">{row.unit}</span>
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
