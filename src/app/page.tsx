import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { DayBadge } from "@/components/ui/DayBadge";
import { Logo } from "@/components/ui/Logo";
import { ProductName } from "@/components/ui/ProductName";
import { Quantity } from "@/components/ui/Quantity";
import { DAY_NAMES, DAY_NUMBERS } from "@/lib/day-number";
import { CountCardDemo } from "./_demo/CountCardDemo";

// صفحة مؤقتة لعرض المكونات الأساسية. بتتبدل بالرئيسية الحقيقية بالخطوة 3.

const SAMPLE_STOCK = [
  { name: "Classic Choco", pieces: 35, piecesPerCake: 10 },
  { name: "Flan", pieces: 17, piecesPerCake: 8 },
  { name: "Nightmare", pieces: 6, piecesPerCake: 10 },
  { name: "Tiramisu", pieces: 24, piecesPerCake: null },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-7 px-5 pt-5 pb-10">
      <header className="flex flex-col gap-1">
        <Logo priority />
        <h1 className="mt-2 text-[26px] leading-tight font-bold">الأساس جاهز</h1>
        <p className="text-base text-muted">صفحة مؤقتة لعرض المكونات. بتتبدل بشاشة الدخول بالخطوة 3.</p>
      </header>

      <Section title="أرقام الأيام">
        <ul className="grid grid-cols-7 gap-1 text-center">
          {DAY_NUMBERS.map((day) => (
            <li key={day} className="flex flex-col items-center gap-1">
              <DayBadge day={day} />
              <span className="text-[11px] text-muted">{DAY_NAMES[day]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="الكميات">
        <ul className="divide-y divide-line-soft rounded-2xl border border-line bg-surface">
          {SAMPLE_STOCK.map((item) => (
            <li key={item.name} className="flex items-center justify-between gap-3 px-4 py-3">
              <ProductName name={item.name} className="font-semibold" />
              <span className="text-sm">
                <Quantity pieces={item.pieces} piecesPerCake={item.piecesPerCake} />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="العداد">
        <CountCardDemo />
      </Section>

      <Section title="الأزرار">
        <Button>تأكيد الجرد</Button>
        <Button variant="secondary" size="md">
          رجوع للتعديل
        </Button>
        <Button variant="warning" size="md">
          ابدأ الجرد الآن
        </Button>
      </Section>
    </main>
  );
}
