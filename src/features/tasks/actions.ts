"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/features/auth/session";
import type { SaveResult } from "@/features/settings/actions";
import { createClient } from "@/lib/supabase/server";
import { templateSchema, type TemplateInput } from "./logic";

const idSchema = z.uuid();

/** الموظف بيعلّم مهمة "انعملت" (complete_task بتفحص الموقع والدور واليوم والصورة). */
export async function completeTaskAction(input: {
  templateId: string;
  note: string;
  photoPath: string | null;
}): Promise<SaveResult> {
  await requireStaff();
  if (!idSchema.safeParse(input.templateId).success) return { status: "error", message: "المهمة مش موجودة" };
  const note = String(input.note ?? "").slice(0, 300);
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_task", {
    p_template_id: input.templateId,
    p_note: note || undefined,
    p_photo_path: input.photoPath ?? undefined,
  });
  if (error) {
    console.error("completeTask", error);
    const message =
      error.hint === "photo_required"
        ? "هالمهمة بدها صورة"
        : error.hint === "already_done"
          ? "هالمهمة انعملت اليوم"
          : error.code === "42501"
            ? "هالمهمة لدور ثاني"
            : "ما انحفظت. جرب كمان مرة.";
    return { status: "error", message };
  }
  refresh();
  return { status: "done" };
}

function toRow(t: z.output<typeof templateSchema>) {
  return {
    title: t.title,
    description: t.description,
    location_ids: t.locationIds,
    role: t.role,
    frequency: t.frequency,
    weekdays: t.frequency === "weekly" ? t.weekdays : null,
    month_day: t.frequency === "monthly" ? t.monthDay : null,
    due_time: t.dueTime,
    requires_photo: t.requiresPhoto,
  };
}

/** مهمة جديدة أو تعديل مهمة (الأدمن، بجلسته: RLS + سجل التعديلات). */
export async function saveTemplateAction(
  templateId: string | null,
  input: TemplateInput,
): Promise<SaveResult> {
  await requireAdmin();
  if (templateId !== null && !idSchema.safeParse(templateId).success) {
    return { status: "error", message: "المهمة مش موجودة" };
  }
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };
  const supabase = await createClient();
  const { error } = templateId
    ? await supabase.from("task_templates").update(toRow(parsed.data)).eq("id", templateId)
    : await supabase.from("task_templates").insert(toRow(parsed.data));
  if (error) {
    console.error("saveTemplate", error);
    return { status: "error", message: "ما انحفظت. جرب كمان مرة." };
  }
  refresh();
  return { status: "done" };
}

export async function setTemplateActiveAction(templateId: string, active: boolean): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(templateId).success || typeof active !== "boolean") {
    return { status: "error", message: "المهمة مش موجودة" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").update({ is_active: active }).eq("id", templateId);
  if (error) return { status: "error", message: "ما انحفظ" };
  refresh();
  return { status: "done" };
}
