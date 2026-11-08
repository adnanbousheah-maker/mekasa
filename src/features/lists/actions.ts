"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/features/auth/session";
import type { SaveResult } from "@/features/settings/actions";
import { ROLES } from "@/features/staff/roles";
import { createClient } from "@/lib/supabase/server";
import { LIST_KEYS, OPTION_COLORS } from "./types";

// الكتابة بجلسة الأدمن (RLS + سجل التعديلات). الحذف بدالة بتفحص إنه ما انستعمل.

const idSchema = z.uuid();
const nameSchema = z.string().trim().min(1, "اكتب الاسم").max(60, "الاسم طويل كثير");
const SAVE_FAILED = "ما انحفظ. جرب كمان مرة.";
const fail = (message: string): SaveResult => ({ status: "error", message });
const done: SaveResult = { status: "done" };

function dbMessage(code: string | undefined, hint?: string): string {
  if (code === "23505") return "في خيار بنفس الاسم بهالقائمة";
  if (hint === "in_use") return "هالخيار مستعمل بسجلات: وقّفه بدل ما تحذفه";
  if (hint === "built_in") return "هالخيار أساسي بالنظام: بتقدر توقفه أو تغيّر اسمه بس";
  if (code === "23514") return "القيمة مش مسموحة هون";
  return SAVE_FAILED;
}

export async function createOptionAction(listKey: string, name: string): Promise<SaveResult> {
  await requireAdmin();
  const key = z.enum(LIST_KEYS).safeParse(listKey);
  const parsed = nameSchema.safeParse(name);
  if (!key.success) return fail("القائمة مش موجودة");
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "الاسم مش صحيح");

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("lookup_options")
    .select("sort_order")
    .eq("list_key", key.data)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("lookup_options")
    .insert({ list_key: key.data, name: parsed.data, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) {
    console.error("createOption", error);
    return fail(dbMessage(error.code));
  }
  refresh();
  return done;
}

const fieldSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("name"), value: nameSchema }),
  z.object({
    field: z.literal("description"),
    value: z
      .string()
      .trim()
      .max(200, "الوصف طويل كثير")
      .transform((v) => v || null),
  }),
  z.object({
    field: z.literal("icon"),
    value: z
      .string()
      .trim()
      .max(8, "أيقونة وحدة (إيموجي)")
      .transform((v) => v || null),
  }),
  z.object({ field: z.literal("color"), value: z.enum(OPTION_COLORS).nullable() }),
  z.object({ field: z.literal("parent"), value: z.uuid().nullable() }),
  z.object({ field: z.literal("active"), value: z.boolean() }),
  z.object({ field: z.literal("requiresNote"), value: z.boolean() }),
  z.object({ field: z.literal("roles"), value: z.array(z.enum(ROLES as [string, ...string[]])).nullable() }),
]);

const COLUMN = {
  name: "name",
  description: "description",
  icon: "icon",
  color: "color",
  parent: "parent_id",
  active: "is_active",
  requiresNote: "requires_note",
  roles: "allowed_roles",
} as const;

/** تعديل حقل واحد بخيار (بينحفظ لحاله متل باقي الإعدادات). */
export async function updateOptionAction(
  optionId: string,
  field: string,
  value: unknown,
): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(optionId).success) return fail("الخيار مش موجود");
  const parsed = fieldSchema.safeParse({ field, value });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "القيمة مش صحيحة");
  const { field: f } = parsed.data;
  // ما في أدوار = الكل
  const v =
    f === "roles" && Array.isArray(parsed.data.value) && parsed.data.value.length === 0
      ? null
      : parsed.data.value;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lookup_options")
    .update({ [COLUMN[f]]: v } as never)
    .eq("id", optionId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("updateOption", f, error);
    return fail(dbMessage(error.code));
  }
  if (!data) return fail("الخيار مش موجود");
  refresh();
  return done;
}

/** طلوع أو نزول خطوة بين إخوته (نفس الأب). */
export async function moveOptionAction(optionId: string, direction: "up" | "down"): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(optionId).success || (direction !== "up" && direction !== "down")) {
    return fail("الخيار مش موجود");
  }
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("lookup_options")
    .select("id, list_key, parent_id")
    .eq("id", optionId)
    .maybeSingle();
  if (!me) return fail("الخيار مش موجود");
  let q = supabase.from("lookup_options").select("id, sort_order, name").eq("list_key", me.list_key);
  q = me.parent_id ? q.eq("parent_id", me.parent_id) : q.is("parent_id", null);
  const { data: siblings, error } = await q.order("sort_order").order("name");
  if (error || !siblings) return fail(SAVE_FAILED);

  const i = siblings.findIndex((s) => s.id === optionId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return done;
  const order = siblings.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  // ترتيب جديد 1..n (بيصلّح الترتيبات المكررة كمان)
  for (const [index, id] of order.entries()) {
    const { error: e } = await supabase
      .from("lookup_options")
      .update({ sort_order: index + 1 })
      .eq("id", id);
    if (e) return fail(SAVE_FAILED);
  }
  refresh();
  return done;
}

export async function deleteOptionAction(optionId: string): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(optionId).success) return fail("الخيار مش موجود");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_option", { p_option_id: optionId });
  if (error) {
    console.error("deleteOption", error);
    return fail(dbMessage(error.code, error.hint));
  }
  refresh();
  return done;
}

/** تصنيف صنف (كيك أو صوص) أو مادة أولية. فاضي = بدون. قاعدة البيانات بتفحص إنه من القائمة الصح. */
export async function setCategoryAction(
  target: "product" | "raw",
  itemId: string,
  categoryId: string | null,
): Promise<SaveResult> {
  await requireAdmin();
  if (target !== "product" && target !== "raw") return fail("القيمة مش صحيحة");
  if (!idSchema.safeParse(itemId).success) return fail("مش موجود");
  if (categoryId !== null && !idSchema.safeParse(categoryId).success) return fail("التصنيف مش موجود");
  const supabase = await createClient();
  const { error } =
    target === "product"
      ? await supabase.from("products").update({ category_id: categoryId }).eq("id", itemId)
      : await supabase.from("raw_materials").update({ category_id: categoryId }).eq("id", itemId);
  if (error) {
    console.error("setCategory", error);
    return fail(dbMessage(error.code));
  }
  refresh();
  return done;
}
