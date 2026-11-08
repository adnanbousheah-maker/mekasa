// أسماء الأدوار ووصفها (design/admin/AdminStaff.dc.html)، وتوافقها مع نوع الموقع.
// نفس القاعدة مفحوصة بقاعدة البيانات (staff_roles_match_location)؛ هون مشان رسالة واضحة قبل الحفظ.

export type Role =
  | "admin"
  | "general_manager"
  | "branch_manager"
  | "branch_staff"
  | "dispatcher"
  | "storekeeper"
  | "packaging_keeper";
export type LocationKind = "factory" | "branch" | "returns_bin" | "packaging";

export const ROLES: readonly Role[] = [
  "branch_staff",
  "branch_manager",
  "dispatcher",
  "storekeeper",
  "packaging_keeper",
  "general_manager",
  "admin",
];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  admin: "أدمن",
  general_manager: "المدير العام",
  branch_manager: "مسؤول فرع",
  branch_staff: "موظف فرع",
  dispatcher: "الإخراج",
  storekeeper: "أمين المستودع",
  packaging_keeper: "أمين التغليف",
};

export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  branch_staff: "جرد، طلب، استلام، تالف. بفرعه بس.",
  branch_manager: "كل شغل موظف الفرع، وبيشوف تقرير فرعه وبيوصله تنبيهاته.",
  general_manager: "بيشوف كل لوحة الإدارة والتقارير والمساعد، بدون تعديل.",
  dispatcher: "طلبات الفروع، الإخراج والتحويل، اختيار الدفعات.",
  storekeeper: "الإنتاج، المواد الأولية، جرد المصنع.",
  packaging_keeper: "مستودع التغليف: طلبات الفروع، الإخراج، الجرد. بينعطى لموظف بأي موقع.",
  admin: "كل شي، وتعديل الأرقام مع سبب.",
};

// null = أي موقع (أمين التغليف بيشتغل بمستودع التغليف وين ما كان موقعه)
const REQUIRED_KIND: Readonly<Record<Exclude<Role, "admin" | "general_manager">, LocationKind | null>> = {
  branch_staff: "branch",
  branch_manager: "branch",
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
    if (role === "admin" || role === "general_manager") continue;
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
