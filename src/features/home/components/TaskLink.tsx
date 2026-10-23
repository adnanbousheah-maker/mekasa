import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  title: string;
  description?: string;
  icon: ReactNode;
  variant?: "row" | "tile";
  // عدد (مثلاً طلبات جديدة) بآخر الزر
  aside?: ReactNode;
};

/** زر مهمة كبير: صف بالفرع (design/branch/Main)، ومربع بالمصنع (design/factory/FactoryHome). */
export function TaskLink({ href, title, description, icon, variant = "row", aside }: Props) {
  if (variant === "tile") {
    return (
      <Link
        href={href}
        className="flex h-[116px] flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4 active:bg-quiet"
      >
        <span className="flex items-start justify-between">
          <span className="flex size-11 items-center justify-center rounded-xl bg-quiet">{icon}</span>
          {aside}
        </span>
        <span className="text-lg font-bold">{title}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="flex h-[84px] items-center gap-4 rounded-[18px] border border-line bg-surface px-5 active:bg-quiet"
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-quiet">
        {icon}
      </span>
      <span className="flex grow flex-col">
        <span className="text-[22px] font-bold">{title}</span>
        {description && <span className="text-sm text-muted">{description}</span>}
      </span>
      {aside}
    </Link>
  );
}
