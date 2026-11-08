import "server-only";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { businessDate, formatClock, formatLongDate } from "@/lib/time";

export interface InboxItem {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  createdAt: string;
  // الوقت مكتوب بالسيرفر (نفس النص عند المتصفح)
  when: string;
  read: boolean;
}

/** إشعاراتي (RLS: كل موظف إشعاراته بس)، الأحدث أول. */
export async function myNotifications(limit = 100): Promise<InboxItem[]> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, url, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load notifications: ${error.message}`);
  return data.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    url: n.url,
    createdAt: n.created_at,
    when: `${formatLongDate(businessDate(new Date(n.created_at)))} ${formatClock(new Date(n.created_at))}`,
    read: n.read_at !== null,
  }));
}

export async function unreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
