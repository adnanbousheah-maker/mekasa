// آخر صفحات الإدارة اللي انفتحت (بهالمتصفح بس)

export type RecentPage = { href: string; label: string };

const KEY = "mekasa:recent-pages";

export function readRecent(): RecentPage[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as RecentPage[];
    return Array.isArray(list) ? list.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function rememberPage(page: RecentPage) {
  try {
    const next = [page, ...readRecent().filter((p) => p.href !== page.href)].slice(0, 6);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // التخزين ممنوع (وضع خاص): ميزة إضافية بس
  }
}
