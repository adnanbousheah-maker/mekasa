"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SavedSwitch } from "@/features/settings/components/SavedSwitch";
import { ROLE_LABELS, type Role } from "@/features/staff/roles";
import { DAY_NAMES, type DayNumber } from "@/lib/day-number";
import { saveTemplateAction, setTemplateActiveAction } from "../actions";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  scheduleLabel,
  type TaskTemplate,
  type TemplateInput,
} from "../logic";

export type TaskLocation = { id: string; name: string; kind: string };

const TASK_ROLES: Role[] = [
  "branch_staff",
  "branch_manager",
  "dispatcher",
  "storekeeper",
  "packaging_keeper",
];
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** الإعدادات ← المهام المتكررة: قائمة المهام، وجديدة/تعديل بنافذة. */
export function TasksTab({ templates, locations }: { templates: TaskTemplate[]; locations: TaskLocation[] }) {
  const [editing, setEditing] = useState<TaskTemplate | "new" | null>(null);
  const names = new Map(locations.map((l) => [l.id, l.name]));
  const where = (t: TaskTemplate) =>
    t.locationIds ? t.locationIds.map((id) => names.get(id) ?? "—").join("، ") : "كل الفروع";

  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grow text-sm text-muted">
          مهام بتتكرر (تنظيف الثلاجة، فحص الحرارة…). الموظف بيشوفها بالرئيسية وبيعلّمها &quot;تمّت&quot;،
          والإيقاف بيخبيها والتاريخ بيضل.
        </span>
        <Button size="md" className="w-auto" onClick={() => setEditing("new")}>
          + مهمة جديدة
        </Button>
      </div>

      <div className="scroll-hint overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="bg-table-head text-table-head-text">
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                المهمة
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                إيمتى
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                وين
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                مين
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                صورة
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                فعّالة
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                <span className="sr-only">تعديل</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-5 text-center text-muted">
                  ما في مهام لسا. ضيف أول مهمة من فوق.
                </td>
              </tr>
            )}
            {templates.map((t) => (
              <tr
                key={t.id}
                className={`border-t border-line-soft ${t.isActive ? "" : "bg-canvas opacity-70"}`}
              >
                <td className="px-3 py-2.5">
                  <span className="font-semibold">{t.title}</span>
                  {t.description && <span className="block text-muted">{t.description}</span>}
                </td>
                <td className="px-3 py-2.5">
                  {scheduleLabel(t)} · <span dir="ltr">{t.dueTime}</span>
                </td>
                <td className="px-3 py-2.5">{where(t)}</td>
                <td className="px-3 py-2.5 text-center">{ROLE_LABELS[t.role as Role] ?? t.role}</td>
                <td className="px-3 py-2.5 text-center">{t.requiresPhoto ? "لازم" : "—"}</td>
                <td className="px-3 py-2.5 text-center">
                  <SavedSwitch
                    size="sm"
                    label={`${t.title} فعّالة`}
                    initial={t.isActive}
                    onSave={(next) => setTemplateActiveAction(t.id, next)}
                  />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <button
                    type="button"
                    className="h-10 rounded-lg border border-line px-3"
                    onClick={() => setEditing(t)}
                    aria-label={`عدّل ${t.title}`}
                  >
                    عدّل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && editing !== "new" ? "تعديل المهمة" : "مهمة جديدة"}
      >
        {editing && (
          <TemplateForm
            key={editing === "new" ? "new" : editing.id}
            template={editing === "new" ? null : editing}
            locations={locations}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

const field = "h-11 rounded-xl border border-line bg-surface px-3 text-base";
const chip = (on: boolean) =>
  `h-10 rounded-[10px] border px-3 text-sm ${on ? "border-ink bg-ink text-white" : "border-line bg-surface"}`;

function TemplateForm({
  template,
  locations,
  onClose,
}: {
  template: TaskTemplate | null;
  locations: TaskLocation[];
  onClose: () => void;
}) {
  const [input, setInput] = useState<TemplateInput>({
    title: template?.title ?? "",
    description: template?.description ?? "",
    locationIds: template?.locationIds ?? [],
    role: (template?.role as TemplateInput["role"]) ?? "branch_staff",
    frequency: template?.frequency ?? "daily",
    weekdays: template?.weekdays ?? [],
    monthDay: template?.monthDay ?? 1,
    dueTime: template?.dueTime ?? "12:00",
    requiresPhoto: template?.requiresPhoto ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const set = (patch: Partial<TemplateInput>) => setInput((v) => ({ ...v, ...patch }));
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveTemplateAction(template?.id ?? null, input);
      if (result.status === "error") setError(result.message);
      else onClose();
    });
  };

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">اسم المهمة</span>
        <input
          className={field}
          value={input.title}
          maxLength={80}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">شرح قصير (اختياري)</span>
        <input
          className={field}
          value={input.description}
          maxLength={300}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm text-muted">وين (بدون اختيار = كل الفروع)</legend>
        <div className="flex flex-wrap gap-1.5">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={input.locationIds.includes(l.id)}
              className={chip(input.locationIds.includes(l.id))}
              onClick={() => set({ locationIds: toggle(input.locationIds, l.id) })}
            >
              {l.name}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">مين بيعملها</span>
        <select
          className={field}
          value={input.role}
          onChange={(e) => set({ role: e.target.value as TemplateInput["role"] })}
        >
          {TASK_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm text-muted">إيمتى</legend>
        <div className="flex flex-wrap gap-1.5">
          {FREQUENCIES.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={input.frequency === f}
              className={chip(input.frequency === f)}
              onClick={() => set({ frequency: f })}
            >
              {FREQUENCY_LABELS[f]}
            </button>
          ))}
        </div>
        {input.frequency === "weekly" && (
          <div className="flex flex-wrap gap-1.5" aria-label="أيام الأسبوع">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={input.weekdays.includes(d)}
                className={chip(input.weekdays.includes(d))}
                onClick={() => set({ weekdays: toggle(input.weekdays, d) })}
              >
                {DAY_NAMES[d as DayNumber]}
              </button>
            ))}
          </div>
        )}
        {input.frequency === "monthly" && (
          <label className="flex items-center gap-2">
            <span className="text-sm">يوم بالشهر</span>
            <select
              className={field}
              value={input.monthDay ?? 1}
              onChange={(e) => set({ monthDay: Number(e.target.value) })}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d === 31 ? "آخر يوم" : d}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <label className="flex items-center gap-2">
        <span className="text-sm text-muted">قبل الساعة</span>
        <input
          type="time"
          className={field}
          value={input.dueTime}
          onChange={(e) => set({ dueTime: e.target.value })}
          aria-label="قبل الساعة"
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={input.requiresPhoto}
          onChange={(e) => set({ requiresPhoto: e.target.checked })}
        />
        <span>لازم صورة</span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="md" onClick={save} disabled={isSaving}>
          {isSaving ? "لحظة…" : "احفظ"}
        </Button>
        <Button size="md" variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
