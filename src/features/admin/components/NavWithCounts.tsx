import { canEdit, isItAdmin, requireManager } from "@/features/auth/session";
import { getFeatures } from "@/features/settings/features";
import { SearchPalette } from "@/features/search/components/SearchPalette";
import { ActiveNavItems } from "./ActiveNavItems";

/** القائمة حسب الدور (المدير العام ما بيشوف الإعدادات والموظفين). الأعداد بتوصل بعدين. */
export async function NavWithCounts() {
  const staff = await requireManager();
  const features = await getFeatures();
  const access = { admin: canEdit(staff), it: isItAdmin(staff), tasks: features.tasks };
  return (
    <>
      <div className="w-32 shrink-0 lg:mb-1 lg:w-full">
        <SearchPalette access={access} />
      </div>
      <ActiveNavItems access={access} />
    </>
  );
}
