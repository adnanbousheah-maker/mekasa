import Link from "next/link";

type Props = {
  title: string;
  step: string;
};

/** صفحة مؤقتة لشاشة لسا ما انبنت، مع رجوع واضح للرئيسية. */
export function ComingSoon({ title, step }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-5">
      <header className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="رجوع"
          className="flex size-12 items-center justify-center rounded-full border border-line bg-surface"
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
        <h1 className="text-[22px] font-bold">{title}</h1>
      </header>
      <p className="rounded-2xl border border-line bg-surface p-5 text-base text-muted">
        هالشاشة بتنبني {step}.
      </p>
    </main>
  );
}
