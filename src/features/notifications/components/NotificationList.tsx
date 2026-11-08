"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markReadAction } from "../actions";
import { kindLabel } from "../kinds";
import type { InboxItem } from "../queries";

type Filter = "all" | "unread" | string;

/** مركز الإشعارات: مقروء وغير مقروء، فلتر حسب النوع، وكل إشعار بيفتح الشي المرتبط فيه. */
export function NotificationList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [readNow, setReadNow] = useState<Set<number>>(new Set());
  const [isSaving, startTransition] = useTransition();

  const isRead = (n: InboxItem) => n.read || readNow.has(n.id);
  const kinds = [...new Set(items.map((n) => n.kind))];
  const shown = items.filter((n) =>
    filter === "all" ? true : filter === "unread" ? !isRead(n) : n.kind === filter,
  );
  const unread = items.filter((n) => !isRead(n)).length;

  const open = (n: InboxItem) => {
    if (!isRead(n)) {
      setReadNow((s) => new Set(s).add(n.id));
      void markReadAction([n.id]);
    }
    if (n.url) router.push(n.url);
  };

  const chip = (value: Filter, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={`h-10 shrink-0 rounded-full px-3.5 text-sm ${filter === value ? "bg-ink font-semibold text-white" : "border border-line-strong bg-surface"}`}
    >
      {label}
    </button>
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="فلتر الإشعارات"
        >
          {chip("all", "الكل")}
          {chip("unread", unread > 0 ? `غير مقروء (${unread})` : "غير مقروء")}
          {kinds.map((k) => chip(k, kindLabel(k)))}
        </div>
        {unread > 0 && (
          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              startTransition(async () => {
                setReadNow(new Set(items.map((n) => n.id)));
                await markReadAction(null);
              })
            }
            className="h-10 rounded-xl border border-line-strong bg-surface px-3.5 text-sm font-semibold disabled:opacity-50"
          >
            ✓ علّم الكل مقروء
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-dashed p-6 text-center text-muted">
          {filter === "unread" ? "قريت كل إشعاراتك 👍" : "ما في إشعارات لسا."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="الإشعارات">
          {shown.map((n) => {
            const read = isRead(n);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-right ${read ? "border-line bg-surface" : "border-ink bg-quiet"}`}
                >
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${read ? "bg-line-strong" : "bg-info"}`}
                    aria-hidden="true"
                  />
                  <span className="flex grow flex-col gap-0.5">
                    <span className={`text-[15px] ${read ? "" : "font-bold"}`}>{n.title}</span>
                    {n.body && <span className="text-sm text-muted">{n.body}</span>}
                    <span className="text-xs text-muted">
                      {kindLabel(n.kind)} · {n.when}
                      {!read && <span className="sr-only"> · غير مقروء</span>}
                    </span>
                  </span>
                  {n.url && (
                    <span className="self-center text-sm font-semibold" aria-hidden="true">
                      ←
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
