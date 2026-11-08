"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

const idsSchema = z.array(z.number().int().positive()).max(500).nullable();

/** قراءة إشعارات (null = الكل). */
export async function markReadAction(ids: number[] | null): Promise<{ ok: boolean }> {
  await requireStaff();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", {
    p_ids: parsed.data ?? undefined,
  });
  if (error) {
    console.error("markRead", error);
    return { ok: false };
  }
  refresh();
  return { ok: true };
}
