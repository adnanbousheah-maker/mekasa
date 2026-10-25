"use server";

import { refresh } from "next/cache";
import { requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { packagingStore } from "./queries";
import { packagingCountSchema, type PackagingCountInput } from "./schemas";

export type PackagingCountResult = { status: "error"; message: string } | { status: "done"; countId: string };

/** جرد مستودع التغليف (كامل: اللي ما انعد صفر). الصلاحية بتنفحص بـ submit_count. */
export async function submitPackagingCountAction(input: PackagingCountInput): Promise<PackagingCountResult> {
  await requireStaff();
  const parsed = packagingCountSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "في رقم مش منطقي. راجع الأرقام." };
  const store = await packagingStore();
  if (!store) return { status: "error", message: "ما في مستودع تغليف فعّال" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_count", {
    p_location_id: store.id,
    p_lines: parsed.data.lines.map((l) => ({ product_id: l.productId, loose_pieces: l.qty })) as Json,
    p_started_at: parsed.data.startedAt,
  });
  if (error) {
    console.error("submitPackagingCount", error);
    return {
      status: "error",
      message: error.code === "42501" ? "ما إلك صلاحية تجرد المستودع" : "ما انحفظ الجرد. جرب كمان مرة.",
    };
  }
  refresh();
  return { status: "done", countId: data };
}
