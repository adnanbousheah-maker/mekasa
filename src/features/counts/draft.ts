"use client";

import { useEffect, useRef, useState } from "react";

/**
 * مسودة الجرد بالجوال: الأرقام بتنحفظ بالمتصفح وهو عم يعدّ، فإذا الصفحة تحدّثت (أو سكّر المتصفح)
 * بترجع لحالها. بتنمسح بعد التأكيد. وقت البداية بيضل نفسه (الجرد بينسجل بوقت بدايته).
 * المسودة القديمة (أكثر من 11 ساعة) بتنتجاهل لأن قاعدة البيانات بترفض جرد بلّش من أكثر من 12 ساعة.
 */
export const DRAFT_MAX_AGE_MS = 11 * 60 * 60_000;

type Stored<T> = { value: T; startedAt: string; savedAt: number };

const keyOf = (name: string) => `mekasa:count-draft:${name}`;

export function readDraft<T>(name: string, now = Date.now()): Stored<T> | null {
  try {
    const raw = window.localStorage.getItem(keyOf(name));
    if (!raw) return null;
    const d = JSON.parse(raw) as Stored<T>;
    if (!d || typeof d.startedAt !== "string" || now - new Date(d.startedAt).getTime() > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(keyOf(name));
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function writeDraft<T>(name: string, value: T, startedAt: string) {
  try {
    window.localStorage.setItem(keyOf(name), JSON.stringify({ value, startedAt, savedAt: Date.now() }));
  } catch {
    // المتصفح ما بيسمح بالتخزين (وضع خاص مثلاً): الجرد بيشتغل عادي بدون مسودة
  }
}

export function clearDraft(name: string) {
  try {
    window.localStorage.removeItem(keyOf(name));
  } catch {
    // ما في شي نعمله
  }
}

/**
 * `value` حالة الفورم (لازم تتحوّل لـ JSON)، و`restore` بترجّع المسودة للفورم.
 * بترجع وقت البداية الصح (من المسودة إذا رجعت)، وهل رجعت، و`discard` لـ"ابدأ من جديد".
 */
export function useCountDraft<T>(
  name: string,
  value: T,
  restore: (saved: T) => void,
  startedAt: string,
  enabled = true,
) {
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const first = useRef(value);
  const loaded = useRef(false);
  // بعد "ابدأ من جديد" الفورم بيرجع فاضي، وهاد التغيير ما بينحفظ كمسودة
  const skipNext = useRef(false);
  const restoreRef = useRef(restore);

  useEffect(() => {
    restoreRef.current = restore;
  });

  useEffect(() => {
    if (enabled) {
      const d = readDraft<T>(name);
      if (d) {
        restoreRef.current(d.value);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- المسودة بالمتصفح بس، ما بتنقرأ بالسيرفر
        setRestoredAt(d.startedAt);
      }
    }
    loaded.current = true;
  }, [name, enabled]);

  useEffect(() => {
    // ما منحفظ الفورم الفاضي قبل ما الموظف يكتب شي
    if (!enabled || !loaded.current || value === first.current) return;
    if (skipNext.current) {
      skipNext.current = false;
      first.current = value;
      return;
    }
    writeDraft(name, value, restoredAt ?? startedAt);
  }, [name, enabled, value, restoredAt, startedAt]);

  return {
    startedAt: restoredAt ?? startedAt,
    restored: restoredAt !== null,
    clear: () => clearDraft(name),
    discard: () => {
      clearDraft(name);
      skipNext.current = true;
      setRestoredAt(null);
    },
  };
}
