"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";

type Saved = { name: string; query: string };

const KEY = (page: string) => `mekasa:filters:${page}`;

function parse(raw: string): Saved[] {
  try {
    const list = raw ? (JSON.parse(raw) as Saved[]) : [];
    return Array.isArray(list) ? list.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function read(page: string): string {
  try {
    return window.localStorage.getItem(KEY(page)) ?? "";
  } catch {
    return "";
  }
}

// تغيير بنفس الصفحة ما بيطلق حدث storage، فبنطلق حدثنا
const EVENT = "mekasa:filters";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function store(page: string, list: Saved[]) {
  try {
    window.localStorage.setItem(KEY(page), JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // المتصفح ممكن يمنع التخزين (وضع خاص): الفلاتر المحفوظة ميزة إضافية بس
  }
}

/** فلاتر محفوظة لكل صفحة (بهالمتصفح): احفظ الحالي، افتح، أو امسح. */
export function SavedFilters({ page }: { page: string }) {
  const params = useSearchParams();
  const query = params.toString();
  // بالسيرفر فاضي، وبالمتصفح من التخزين (بدون فرق بالرسم الأول)
  const raw = useSyncExternalStore(
    subscribe,
    () => read(page),
    () => "",
  );
  const saved = useMemo(() => parse(raw), [raw]);

  const save = () => {
    const name = window.prompt("اسم للفلتر (مثلاً: تالف دابوق هالشهر)")?.trim();
    if (!name) return;
    const next = [{ name: name.slice(0, 40), query }, ...saved.filter((s) => s.name !== name)].slice(0, 12);
    store(page, next);
  };
  const remove = (name: string) => {
    store(
      page,
      saved.filter((s) => s.name !== name),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="الفلاتر المحفوظة">
      {saved.map((s) => (
        <span
          key={s.name}
          className="inline-flex items-center rounded-full border border-line bg-surface text-xs"
        >
          <Link href={s.query ? `${page}?${s.query}` : page} className="py-1.5 ps-3 pe-1.5">
            ★ {s.name}
          </Link>
          <button
            type="button"
            onClick={() => remove(s.name)}
            aria-label={`امسح الفلتر ${s.name}`}
            className="py-1.5 ps-1 pe-2.5 text-muted"
          >
            ×
          </button>
        </span>
      ))}
      {query && (
        <button type="button" onClick={save} className="h-8 rounded-full px-3 text-xs text-muted underline">
          ☆ احفظ هالفلتر
        </button>
      )}
    </div>
  );
}
