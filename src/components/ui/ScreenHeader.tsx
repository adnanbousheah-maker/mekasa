import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
  // شي بآخر السطر (مثلاً صورة الفورم)
  aside?: ReactNode;
};

/** رأس شاشات الموظفين: زر رجوع دائري، والعنوان، وسطر تحته. */
export function ScreenHeader({ title, subtitle, backHref = "/", aside }: Props) {
  return (
    <header className="flex items-center gap-2">
      <Link
        href={backHref}
        aria-label="رجوع"
        className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>
      <div className="flex grow flex-col">
        <h1 className="text-[22px] leading-tight font-bold">{title}</h1>
        {subtitle && <span className="text-sm text-muted">{subtitle}</span>}
      </div>
      {aside}
    </header>
  );
}
