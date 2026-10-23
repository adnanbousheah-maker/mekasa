import { Suspense } from "react";
import { AdminLoading } from "@/components/ui/AdminLoading";
import { StaffForm } from "@/features/staff/components/StaffForm";
import { listWorkLocations } from "@/features/staff/queries";

async function NewStaff() {
  const locations = await listWorkLocations();
  return (
    <>
      <h1 className="text-[26px] font-bold">موظف جديد</h1>
      <StaffForm locations={locations} />
    </>
  );
}

export default function NewStaffPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <NewStaff />
    </Suspense>
  );
}
