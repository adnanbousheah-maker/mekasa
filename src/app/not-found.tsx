import Link from "next/link";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StaffScreen } from "@/components/ui/StaffScreen";

// صفحة مش موجودة، أو مخفية عن موقعك (RLS)
export default function NotFound() {
  return (
    <StaffScreen>
      <ScreenHeader title="مش موجودة" />
      <p className="rounded-2xl border border-line bg-surface p-5 text-base text-muted">
        هالصفحة مش موجودة، أو مش إلك.
      </p>
      <Link
        href="/"
        className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-lg font-semibold text-white"
      >
        رجوع للرئيسية
      </Link>
    </StaffScreen>
  );
}
