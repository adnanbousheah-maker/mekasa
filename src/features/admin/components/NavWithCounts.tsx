import { canEdit, requireManager } from "@/features/auth/session";
import { ActiveNavItems } from "./ActiveNavItems";

/** القائمة حسب الدور (المدير العام ما بيشوف الإعدادات والموظفين). الأعداد بتوصل بعدين. */
export async function NavWithCounts() {
  const staff = await requireManager();
  return <ActiveNavItems isAdmin={canEdit(staff)} />;
}
