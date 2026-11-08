import { canEdit, requireManager } from "@/features/auth/session";
import { SearchPalette } from "@/features/search/components/SearchPalette";
import { ActiveNavItems } from "./ActiveNavItems";

/** القائمة حسب الدور (المدير العام ما بيشوف الإعدادات والموظفين). الأعداد بتوصل بعدين. */
export async function NavWithCounts() {
  const staff = await requireManager();
  return (
    <>
      <div className="w-32 shrink-0 lg:mb-1 lg:w-full">
        <SearchPalette isAdmin={canEdit(staff)} />
      </div>
      <ActiveNavItems isAdmin={canEdit(staff)} />
    </>
  );
}
