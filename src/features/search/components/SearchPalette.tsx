"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { NAV_PAGES } from "@/features/admin/components/NavItemList";
import { matches } from "@/features/reports/filters";
import { globalSearchAction, type SearchHit } from "../actions";
import { readRecent } from "../recent";

type Item = { key: string; label: string; hint: string; href: string };

/**
 * بحث عام بلوحة الإدارة: Ctrl+K (أو ⌘K، أو /). الصفحات بتطلع فوراً، والأصناف والموظفين
 * والمواقع والمواد من السيرفر. بدون كتابة: آخر الصفحات. الأسهم بتتنقل وEnter بيفتح.
 */
export function SearchPalette({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<{ href: string; label: string }[]>([]);
  const [isSearching, startTransition] = useTransition();

  const show = () => {
    setRecent(readRecent());
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
    }
    if (!open && d.open) d.close();
    // Next بيخبّي الصفحة القديمة: نسكّر لما المكون ينشال
    return () => {
      if (d.open) d.close();
    };
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        setHits(await globalSearchAction(q));
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const items: Item[] = useMemo(() => {
    const pages = NAV_PAGES.filter((p) => isAdmin || !p.adminOnly);
    if (!q.trim()) {
      const list = recent.length ? recent : pages.slice(0, 6);
      return list.map((p) => ({
        key: `r${p.href}`,
        label: p.label,
        hint: recent.length ? "فتحتها قبل" : "صفحة",
        href: p.href,
      }));
    }
    const pageHits = pages
      .filter((p) => matches(q, p.label, p.group))
      .map((p) => ({ key: `p${p.href}`, label: p.label, hint: "صفحة", href: p.href }));
    const dataHits = q.trim().length >= 2 ? hits.map((h, i) => ({ key: `h${i}`, ...h })) : [];
    return [...pageHits, ...dataHits];
  }, [q, hits, recent, isAdmin]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(item.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-muted"
      >
        <span aria-hidden="true">⌕</span>
        <span className="grow text-right">بحث</span>
        <kbd
          className="hidden rounded border border-line px-1.5 text-[11px] pointer-fine:lg:inline"
          dir="ltr"
        >
          Ctrl K
        </kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="بحث بالنظام"
        onClose={() => setOpen(false)}
        // كبسة برا الصندوق (على الخلفية) بتسكّر، أسهل من Esc على الجوال
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-auto mt-4 w-[min(560px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40 sm:mt-[10vh]"
      >
        <div className="flex flex-col">
          <div className="flex items-center border-b border-line">
            <input
              ref={input}
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Escape") {
                  // خانة البحث بتمسح النص بـ Escape بدل ما تسكّر: نسكّر إحنا
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(items[active]);
                }
              }}
              placeholder="دوّر على صفحة، صنف، موظف، فرع، مادة…"
              aria-label="اكتب للبحث"
              aria-controls="search-results"
              className="h-14 min-w-0 grow bg-transparent px-4 text-base outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 shrink-0 px-4 text-[15px] font-semibold text-muted"
            >
              سكّر
            </button>
          </div>
          <ul
            id="search-results"
            role="listbox"
            aria-label="النتائج"
            className="max-h-[50vh] overflow-y-auto p-2"
          >
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">
                {isSearching ? "عم يدوّر…" : q.trim().length < 2 ? "اكتب حرفين على الأقل" : "ما لقيت إشي"}
              </li>
            )}
            {!q.trim() && items.length > 0 && (
              <li className="px-3 pt-1 pb-1.5 text-xs text-muted" role="presentation">
                {recent.length ? "آخر الصفحات" : "صفحات"}
              </li>
            )}
            {items.map((item, i) => (
              <li
                key={item.key}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 active:bg-quiet ${i === active ? "pointer-fine:bg-quiet" : ""}`}
              >
                <span dir="auto" className="font-semibold">
                  {item.label}
                </span>
                <span className="shrink-0 text-xs text-muted">{item.hint}</span>
              </li>
            ))}
          </ul>
          {/* تلميح الكيبورد للابتوب بس (الجوال ما فيه أسهم ولا Esc) */}
          <div className="hidden justify-between border-t border-line px-4 py-2 text-[11px] text-muted pointer-fine:flex">
            <span>↑↓ للتنقل · Enter للفتح · Esc للإغلاق</span>
            {isSearching && <span>عم يدوّر…</span>}
          </div>
        </div>
      </dialog>
    </>
  );
}
