import "server-only";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  isListKey,
  treeOrder,
  type ListInfo,
  type ListKey,
  type ListOption,
  type OptionColor,
} from "./types";

export async function listLists(): Promise<ListInfo[]> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.from("lookup_lists").select("*").order("sort_order");
  if (error) throw new Error(`Could not load lists: ${error.message}`);
  return data
    .filter((l) => isListKey(l.key))
    .map((l) => ({
      key: l.key as ListKey,
      name: l.name,
      description: l.description,
      allowsChildren: l.allows_children,
      allowsRoles: l.allows_roles,
    }));
}

/** خيارات قائمة (مع الموقوف، وعدد الاستعمال). الترتيب حسب sort_order. */
export async function listOptions(key: ListKey): Promise<ListOption[]> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_lookup_options")
    .select("*")
    .eq("list_key", key)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load options: ${error.message}`);
  return data.map((o) => ({
    id: o.id!,
    listKey: o.list_key as ListKey,
    parentId: o.parent_id,
    code: o.code,
    name: o.name!,
    description: o.description,
    color: (o.color as OptionColor | null) ?? null,
    icon: o.icon,
    sortOrder: o.sort_order ?? 0,
    isActive: o.is_active ?? true,
    requiresNote: o.requires_note ?? false,
    allowedRoles: o.allowed_roles,
    usageCount: o.usage_count ?? 0,
  }));
}

/** التصنيفات للاختيار: الفعّالة (والمختارة حالياً حتى لو موقوفة)، الرئيسي وتحته فروعه. */
export async function categoryChoices(
  key: "product_categories" | "raw_categories",
): Promise<{ id: string; name: string; depth: 0 | 1 }[]> {
  const options = await listOptions(key);
  return treeOrder(options.filter((o) => o.isActive || o.usageCount > 0)).map((o) => ({
    id: o.id,
    name: o.isActive ? o.name : `${o.name} (موقوف)`,
    depth: o.depth,
  }));
}

/** اسم كل تصنيف حسب id (للعرض والتجميع). */
export async function categoryNames(
  key: "product_categories" | "raw_categories",
): Promise<Map<string, string>> {
  return new Map((await listOptions(key)).map((o) => [o.id, o.name]));
}
