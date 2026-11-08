import "server-only";
import { requireManager, requireStaff, type CurrentStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatClock } from "@/lib/time";
import type { Frequency, TaskTemplate } from "./logic";

export interface TodayTask {
  templateId: string;
  title: string;
  description: string | null;
  role: string;
  requiresPhoto: boolean;
  dueTime: string;
  locationId: string;
  locationName: string;
  status: "done" | "late" | "open";
  doneAt: string | null;
  doneBy: string | null;
  note: string | null;
  photoPath: string | null;
}

async function names(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_staff_names")
    .select("id, full_name")
    .in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((s) => [s.id!, s.full_name!]));
}

async function todayRows(): Promise<TodayTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_tasks_today")
    .select("*")
    .order("sort_order")
    .order("due_time")
    .order("title");
  if (error) throw new Error(`Could not load today's tasks: ${error.message}`);
  const who = await names(data.map((t) => t.done_by).filter((id): id is string => !!id));
  return data.map((t) => ({
    templateId: t.template_id!,
    title: t.title!,
    description: t.description,
    role: t.role!,
    requiresPhoto: t.requires_photo!,
    dueTime: t.due_time!.slice(0, 5),
    locationId: t.location_id!,
    locationName: t.location_name!,
    status: t.status as TodayTask["status"],
    doneAt: t.done_at ? formatClock(new Date(t.done_at)) : null,
    doneBy: t.done_by ? (who.get(t.done_by) ?? null) : null,
    note: t.note,
    photoPath: t.photo_path,
  }));
}

/** مهام اليوم لهالموظف: بموقعه، وبأدواره (مسؤول الفرع = موظف فرع). */
export async function myTasksToday(staff?: CurrentStaff): Promise<TodayTask[]> {
  const me = staff ?? (await requireStaff());
  if (!me.location) return [];
  const rows = await todayRows();
  return rows.filter((t) => t.locationId === me.location!.id && me.roles.includes(t.role as never));
}

/** مهام اليوم بكل المواقع (الأدمن والمدير العام). */
export async function allTasksToday(): Promise<TodayTask[]> {
  await requireManager();
  return todayRows();
}

export async function listTemplates(): Promise<TaskTemplate[]> {
  await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_templates")
    .select("*")
    .order("is_active", { ascending: false })
    .order("sort_order")
    .order("title");
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return data.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    locationIds: t.location_ids,
    role: t.role,
    frequency: t.frequency as Frequency,
    weekdays: t.weekdays,
    monthDay: t.month_day,
    dueTime: t.due_time.slice(0, 5),
    requiresPhoto: t.requires_photo,
    isActive: t.is_active,
  }));
}

export interface TaskHistoryRow {
  id: string;
  title: string;
  locationName: string;
  dueDate: string;
  doneAt: string;
  doneBy: string;
  note: string | null;
  photoPath: string | null;
}

/** آخر المهام اللي انعملت (للأدمن، بصورها وملاحظاتها). */
export async function recentTaskRuns(limit = 50): Promise<TaskHistoryRow[]> {
  await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_runs")
    .select(
      "id, due_date, done_at, done_by, note, photo_path, template:task_templates(title), location:locations(name)",
    )
    .order("done_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load task history: ${error.message}`);
  const who = await names(data.map((r) => r.done_by));
  return data.map((r) => ({
    id: r.id,
    title: r.template.title,
    locationName: r.location.name,
    dueDate: r.due_date,
    doneAt: r.done_at,
    doneBy: who.get(r.done_by) ?? "",
    note: r.note,
    photoPath: r.photo_path,
  }));
}

/** المواقع اللي ممكن تنحطلها مهام (الفروع، المصنع، مستودع التغليف). */
export async function taskLocations(): Promise<{ id: string; name: string; kind: string }[]> {
  await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, kind")
    .in("kind", ["branch", "factory", "packaging"])
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Could not load locations: ${error.message}`);
  return data;
}
