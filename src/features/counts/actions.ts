"use server";

import { refresh } from "next/cache";
import { requireAdmin, requireStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { z } from "zod";
import {
  correctionSchema,
  MAX_COUNT_PIECES,
  MAX_COUNT_VALUE,
  submitCountSchema,
  toRpcLines,
  type SubmitCountInput,
} from "./schemas";

export type SubmitCountResult = { status: "error"; message: string } | { status: "done"; countId: string };

const SAVE_FAILED = "ما انحفظ الجرد. تأكد من النت وجرب كمان مرة.";

/** رسالة واضحة: شو المشكلة وشو يعمل الموظف، مش بس "في رقم مش منطقي". */
function countErrorMessage(error: { code?: string; hint?: string; message?: string }): string {
  const { code, hint, message = "" } = error;
  if (hint === "stale_count")
    return "في جرد ثاني انعمل هون بعد ما فتحت الشاشة. ارجع للرئيسية وافتح الجرد من جديد.";
  if (hint === "not_editable")
    return "عدّت ربع ساعة على الجرد (أو انعمل جرد بعده)، ما بينعدّل. احكي مع الإدارة.";
  if (code === "23505") return "هالجرد انعمل قبل. ارجع للرئيسية.";
  if (code === "42501") return "ما إلك صلاحية تجرد هون";
  if (message.includes("start time is out of range"))
    return "شاشة الجرد مفتوحة من زمان (أكثر من 12 ساعة). ارجع للرئيسية وافتح الجرد من جديد، والأرقام اللي كتبتها اكتبها مرة ثانية.";
  if (message.includes("production date must be within"))
    return "في دفعة تاريخها أقدم من شهرين أو بالمستقبل. شيل هالدفعة واختار رقم اليوم الصح.";
  if (message.includes("known product"))
    return "في صنف انوقف أو تغيّر من الإدارة وانت بتجرد. ارجع للرئيسية وافتح الجرد من جديد.";
  if (message.includes("does not belong here") || message.includes("sauces have no batches"))
    return "في صنف مش تبع هالجرد (مثلاً صوص أو تغليف بجرد الكيك). احكي مع الإدارة.";
  if (code === "23514") return "النظام ما قبل الجرد. صوّر الشاشة وابعتها للإدارة.";
  return SAVE_FAILED;
}

/** الرقم اللي رفضه الفحص: "رقم القطع عند السطر 3: 12000 (أكبر رقم 9999)". */
function schemaMessage(issues: { path: PropertyKey[]; message: string }[], input: SubmitCountInput): string {
  const issue = issues[0];
  if (!issue) return "في معلومة ناقصة. ارجع وجرب كمان مرة.";
  const [where, index, field] = issue.path;
  if (where === "lines" && typeof index === "number") {
    const line = input.lines?.[index] as Record<string, unknown> | undefined;
    const value = typeof field === "string" ? line?.[field] : undefined;
    return `${issue.message}، وانكتب ${String(value ?? "")}. صحّح الرقم وأكّد كمان مرة.`;
  }
  return "في معلومة ناقصة. ارجع للرئيسية وافتح الجرد من جديد.";
}

/** تأكيد الجرد: كل شي بدالة submit_count (الجرد وأسطره وحركاته مع بعض). الموقع من الجلسة. */
export async function submitCountAction(input: SubmitCountInput): Promise<SubmitCountResult> {
  const staff = await requireStaff();
  if (!staff.location) return { status: "error", message: "حسابك مش مربوط بموقع" };

  const parsed = submitCountSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: schemaMessage(parsed.error.issues, input) };

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
    return { status: "error", message: countErrorMessage(error) };
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

const editCountSchema = z.object({
  countId: z.uuid(),
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        wholeCakes: z.number().int().min(0).max(MAX_COUNT_VALUE),
        loosePieces: z.number().int().min(0).max(MAX_COUNT_PIECES),
      }),
    )
    .max(400),
});

/** الموظف بيعدّل جرده خلال ربع ساعة (staff_edit_count بتفحص الوقت والموقع، وإنه آخر جرد). */
export async function editCountAction(input: z.input<typeof editCountSchema>): Promise<SubmitCountResult> {
  await requireStaff();
  const parsed = editCountSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "في رقم أكبر من المسموح (999 كيكة أو 9999 قطعة)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_edit_count", {
    p_count_id: parsed.data.countId,
    p_lines: parsed.data.lines.map((l) => ({
      line_id: l.lineId,
      whole_cakes: l.wholeCakes,
      loose_pieces: l.loosePieces,
    })) as Json,
  });
  if (error) {
    console.error("editCount", error);
    return { status: "error", message: countErrorMessage(error) };
  }
  refresh();
  return { status: "done", countId: parsed.data.countId };
}
