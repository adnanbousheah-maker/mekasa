import { StaffForm } from "@/features/staff/components/StaffForm";
import { listWorkLocations } from "@/features/staff/queries";

export default async function NewStaffPage() {
  const locations = await listWorkLocations();
  return (
    <>
      <h1 className="text-[26px] font-bold">موظف جديد</h1>
      <StaffForm locations={locations} />
    </>
  );
}
