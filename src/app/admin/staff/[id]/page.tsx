import { notFound } from "next/navigation";
import { formatPhone } from "@/features/auth/phone";
import { StaffForm } from "@/features/staff/components/StaffForm";
import { getStaff, listWorkLocations } from "@/features/staff/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [staff, locations] = await Promise.all([getStaff(id), listWorkLocations()]);
  if (!staff) notFound();

  return (
    <>
      <h1 className="text-[26px] font-bold">تعديل {staff.fullName}</h1>
      <StaffForm
        locations={locations}
        existing={{
          id: staff.id,
          fullName: staff.fullName,
          phone: formatPhone(staff.phone),
          locationId: staff.location?.id ?? null,
          roles: staff.roles,
        }}
      />
    </>
  );
}
