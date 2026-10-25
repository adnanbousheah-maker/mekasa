// أسماء الأدوار ووصفها (design/admin/AdminStaff.dc.html)، وتوافقها مع نوع الموقع.
// نفس القاعدة مفحوصة بقاعدة البيانات (staff_roles_match_location)؛ هون مشان رسالة واضحة قبل الحفظ.

export type Role = "admin" | "branch_staff" | "dispatcher" | "storekeeper" | "packaging_keeper";
export type LocationKind = "factory" | "branch" | "returns_bin" | "packaging";

export const ROLES: readonly Role[] = [
  "branch_staff",
  "dispatcher",
  "storekeeper",
  "packaging_keeper",
  "admin",
];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  admin: "أدمن",
  branch_staff: "موظف فرع",
  dispatcher: "الإخراج",
  storekeeper: "أمين المستودع",
  packaging_keeper: "أمين التغليف",
};

export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  branch_staff: "جرد، طلب، استلام، تالف. بفرعه بس.",
  dispatcher: "طلبات الفروع، الإخراج والتحويل، اختيار الدفعات.",
  storekeeper: "الإنتاج، المواد الأولية، جرد المصنع.",
  packaging_keeper: "مستودع التغليف: طلبات الفروع، الإخراج، الجرد. بينعطى لموظف بأي موقع.",
  admin: "كل شي، وتعديل الأرقام مع سبب.",
};

// null = أي موقع (أمين التغليف بيشتغل بمستودع التغليف وين ما كان موقعه)
const REQUIRED_KIND: Readonly<Record<Exclude<Role, "admin">, LocationKind | null>> = {
  branch_staff: "branch",
  dispatcher: "factory",
  storekeeper: "factory",
  packaging_keeper: null,
};

/** رسالة بالعربي إذا الأدوار ما بتناسب الموقع، أو null إذا تمام. */
export function roleLocationProblem(
  roles: readonly Role[],
  locationKind: LocationKind | null,
): string | null {
  if (roles.length === 0) return "اختار دور واحد على الأقل";

  for (const role of roles) {
    if (role === "admin") continue;
    if (locationKind === null) return "اختار الموقع";
    const required = REQUIRED_KIND[role];
    if (required !== null && locationKind !== required) {
      return required === "branch"
        ? `${ROLE_LABELS[role]} لازم يكون بفرع`
        : `${ROLE_LABELS[role]} لازم يكون بالمصنع`;
    }
  }
  return null;
}
