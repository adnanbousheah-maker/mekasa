// القوائم اللي بيديرها الأدمن (lookup_lists / lookup_options). ملف بدون استيراد سيرفر، للمتصفح كمان.

export const LIST_KEYS = ["waste_reasons", "product_categories", "raw_categories", "suppliers"] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export const OPTION_COLORS = ["gray", "green", "orange", "red", "blue", "gold", "purple"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export const COLOR_LABELS: Record<OptionColor, string> = {
  gray: "رمادي",
  green: "أخضر",
  orange: "برتقالي",
  red: "أحمر",
  blue: "أزرق",
  gold: "ذهبي",
  purple: "بنفسجي",
};

// classes من الـ tokens (ما في hex بالمكونات)
export const COLOR_CHIP: Record<OptionColor, string> = {
  gray: "bg-quiet text-muted",
  green: "bg-ok-soft text-ok-text",
  orange: "bg-warn-soft text-warn-text",
  red: "bg-danger-soft text-danger-text",
  blue: "bg-info-soft text-info-text",
  gold: "bg-quiet text-brand",
  purple: "bg-quiet text-ink",
};

export interface ListInfo {
  key: ListKey;
  name: string;
  description: string | null;
  allowsChildren: boolean;
  allowsRoles: boolean;
}

export interface ListOption {
  id: string;
  listKey: ListKey;
  parentId: string | null;
  code: string | null;
  name: string;
  description: string | null;
  color: OptionColor | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresNote: boolean;
  allowedRoles: string[] | null;
  usageCount: number;
}

export function isListKey(value: unknown): value is ListKey {
  return typeof value === "string" && (LIST_KEYS as readonly string[]).includes(value);
}

/** الخيارات المرتبة: الرئيسي وتحته فروعه. */
export function treeOrder<T extends { id: string; parentId: string | null; sortOrder: number; name: string }>(
  options: T[],
): (T & { depth: 0 | 1 })[] {
  const byOrder = (a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ar");
  const mains = options.filter((o) => !o.parentId || !options.some((p) => p.id === o.parentId)).sort(byOrder);
  return mains.flatMap((m) => [
    { ...m, depth: 0 as const },
    ...options
      .filter((c) => c.parentId === m.id)
      .sort(byOrder)
      .map((c) => ({ ...c, depth: 1 as const })),
  ]);
}

/** الخيارات اللي بيقدر هالموظف يختارها (فعّالة ومسموحة لأدواره). */
export function usableOptions<T extends { isActive: boolean; allowedRoles: string[] | null }>(
  options: T[],
  roles: readonly string[],
): T[] {
  return options.filter(
    (o) =>
      o.isActive &&
      (!o.allowedRoles || roles.includes("admin") || o.allowedRoles.some((r) => roles.includes(r))),
  );
}
