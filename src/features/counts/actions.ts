"use server";

import { refresh } from "next/cache";
import { requireAdmin, requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { correctionSchema, submitCountSchema, toRpcLines, type SubmitCountInput } from "./schemas";

export type SubmitCountResult = { status: "error"; message: string } | { status: "done"; countId: string };

const SAVE_FAILED = "ما انحفظ الجرد. تأكد من النت وجرب كمان مرة.";

function countErrorMessage(code: string | undefined): string {
  if (code === "23505") return "هالجرد انعمل قبل. ارجع للرئيسية.";
  if (code === "42501") return "ما إلك صلاحية تجرد هون";
  if (code === "23514") return "في رقم مش منطقي. راجع الأرقام وجرب كمان مرة.";
  return SAVE_FAILED;
}

/** تأكيد الجرد: كل شي بدالة submit_count (الجرد وأسطره وحركاته مع بعض). الموقع من الجلسة. */
export async function submitCountAction(input: SubmitCountInput): Promise<SubmitCountResult> {
  const staff = await requireStaff();
  if (!staff.location) return { status: "error", message: "حسابك مش مربوط بموقع" };

  const parsed = submitCountSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "في رقم مش منطقي. راجع الأرقام." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_count", {
    p_location_id: staff.location.id,
    p_lines: toRpcLines(parsed.data.lines) as Json,
    p_started_at: parsed.data.startedAt,
    p_schedule_id: parsed.data.scheduleId ?? undefined,
    p_method: parsed.data.method,
    p_photo_path: parsed.data.photoPath ?? undefined,
    p_form_version_id: parsed.data.formVersionId ?? undefined,
  });
  if (error) {
    console.error("submitCount", error);
    return { status: "error", message: countErrorMessage(error.code) };
  }
  refresh();
  return { status: "done", countId: data };
}

export type CorrectionResult = { status: "error"; message: string } | { status: "done" };

/** تصحيح الأدمن لسطر بجرد مؤكد، مع سبب إجباري (بيتسجل بسجل التعديلات). */
export async function correctCountLineAction(input: {
  lineId: string;
  wholeCakes: number;
  loosePieces: number;
  reason: string;
}): Promise<CorrectionResult> {
  await requireAdmin();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "القيمة مش صحيحة" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_correct_count_line", {
    p_line_id: parsed.data.lineId,
    p_whole_cakes: parsed.data.wholeCakes,
    p_loose_pieces: parsed.data.loosePieces,
    p_reason: parsed.data.reason,
  });
  if (error) {
    console.error("correctCountLine", error);
    return {
      status: "error",
      message: error.code === "23514" ? "الرقم مش منطقي لهالصنف" : "ما انحفظ التعديل",
    };
  }
  refresh();
  return { status: "done" };
}
