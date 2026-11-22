"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireManager, requireStaff } from "@/features/auth/session";
import type { SaveResult } from "@/features/settings/actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import {
  createDispatchSchema,
  createRequestSchema,
  receiveSchema,
  roundSchema,
  type CreateDispatchInput,
  type CreateRequestInput,
  type ReceiveInput,
  type RoundInput,
} from "./logic";

export type OrderResult =
  { status: "error"; message: string; fefoOverride?: boolean } | { status: "done"; id: string };

const SAVE_FAILED = "ما انحفظ. تأكد من النت وجرب كمان مرة.";

function messageFor(error: { code?: string; hint?: string; message: string }): OrderResult {
  if (error.hint === "fefo_override") {
    return { status: "error", message: "في دفعة أقدم لسا بالمصنع", fefoOverride: true };
  }
  if (error.hint === "not_enough_stock")
    return { status: "error", message: "ستوك المصنع ما بيكفي. سجّل الإنتاج أو الجرد أول." };
  if (error.hint === "expired_batch")
    return { status: "error", message: "في دفعة خلصت مدتها. سجّلها تالف بدل ما تطلع." };
  if (error.hint === "not_editable")
    return { status: "error", message: "عدّت ربع ساعة على الطلب، ما بينعدّل. احكي مع الإدارة." };
  if (error.hint === "too_many_pieces") return { status: "error", message: "القطع لحد 99" };
  if (error.code === "42501") return { status: "error", message: "ما إلك صلاحية لهالعملية" };
  if (error.code === "23514" || error.code === "23505")
    return { status: "error", message: "في معلومة مش منطقية أو العملية انعملت قبل" };
  return { status: "error", message: SAVE_FAILED };
}

export async function createRequestAction(input: CreateRequestInput): Promise<OrderResult> {
  await requireStaff();
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_request", {
    p_lines: parsed.data.lines.map((l) => ({
      product_id: l.productId,
      whole_cakes: l.wholeCakes,
      loose_pieces: l.loosePieces,
      suggested_pieces: l.suggestedPieces,
    })) as Json,
    p_note: parsed.data.note || undefined,
    p_missing: parsed.data.missing.map((m) => ({
      product_id: m.productId,
      suggested_pieces: m.suggestedPieces,
    })) as Json,
  });
  if (error) {
    console.error("createRequest", error);
    return messageFor(error);
  }
  refresh();
  return { status: "done", id: data };
}

/** تعديل طلب خلال ربع ساعة: الطلب القديم بينلغى وبينعمل جديد بنفس الوقت (edit_request). */
export async function editRequestAction(requestId: string, input: CreateRequestInput): Promise<OrderResult> {
  await requireStaff();
  if (!z.uuid().safeParse(requestId).success) return { status: "error", message: "الطلب مش موجود" };
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edit_request", {
    p_request_id: requestId,
    p_lines: parsed.data.lines.map((l) => ({
      product_id: l.productId,
      whole_cakes: l.wholeCakes,
      loose_pieces: l.loosePieces,
      suggested_pieces: l.suggestedPieces,
    })) as Json,
    p_note: parsed.data.note || undefined,
    p_missing: parsed.data.missing.map((m) => ({
      product_id: m.productId,
      suggested_pieces: m.suggestedPieces,
    })) as Json,
  });
  if (error) {
    console.error("editRequest", error);
    return messageFor(error);
  }
  refresh();
  return { status: "done", id: data };
}

/** إلغاء طلب ما طلع: الأدمن والمدير العام بأي وقت، والفرع خلال ربع ساعة (cancel_request بتفحص). */
export async function cancelRequestAction(requestId: string): Promise<OrderResult> {
  await requireStaff();
  if (!z.uuid().safeParse(requestId).success) return { status: "error", message: "الطلب مش موجود" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return messageFor(error);
  refresh();
  return { status: "done", id: requestId };
}

export async function createDispatchAction(input: CreateDispatchInput): Promise<OrderResult> {
  await requireStaff();
  const parsed = createDispatchSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_dispatch", {
    p_to_location_id: d.toLocationId,
    p_request_id: d.requestId ?? undefined,
    p_note: d.note || undefined,
    p_confirm_fefo_override: d.confirmFefoOverride,
    p_driver_name: d.driverName || undefined,
    p_lines: d.lines.map((l) => ({
      product_id: l.productId,
      whole_cakes: l.wholeCakes,
      loose_pieces: l.loosePieces,
      request_line_id: l.requestLineId,
      ...(l.batches?.length
        ? {
            batches: l.batches.map((b) => ({
              production_date: b.productionDate,
              frozen: b.frozen,
              qty_pieces: b.qty,
            })),
          }
        : {}),
    })) as Json,
  });
  if (error) {
    if (error.hint !== "fefo_override") console.error("createDispatch", error);
    return messageFor(error);
  }
  if (d.closeRequest && d.requestId) {
    // إذا كل الطلب طلع، الطلب مش "طلع جزء" والتسكير ما إله لزوم
    const { error: closeError } = await supabase.rpc("close_request", { p_request_id: d.requestId });
    if (closeError && closeError.code !== "23514") console.error("closeRequest", closeError);
  }
  refresh();
  return { status: "done", id: data };
}

/** "سكّر الطلب": اللي ضل من طلب طلع جزء منه ما رح يطلع. */
export async function closeRequestAction(requestId: string): Promise<OrderResult> {
  await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { status: "error", message: "الطلب مش موجود" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_request", { p_request_id: requestId });
  if (error) {
    console.error("closeRequest", error);
    return error.code === "23514" ? { status: "error", message: "هالطلب مش مفتوح" } : messageFor(error);
  }
  refresh();
  return { status: "done", id: requestId };
}

/** توزيع اليوم: كل الطلبات مرة وحدة، والقديم بيتوزع بالعدل (dispatch_round). */
export async function dispatchRoundAction(
  input: RoundInput,
): Promise<{ status: "error"; message: string } | { status: "done"; count: number }> {
  await requireStaff();
  const parsed = roundSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "في معلومة ناقصة" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_round", {
    p_round: parsed.data.map((e) => ({
      request_id: e.requestId,
      driver_name: e.driverName || null,
      lines: e.lines.map((l) => ({
        product_id: l.productId,
        request_line_id: l.requestLineId,
        whole_cakes: l.wholeCakes,
        loose_pieces: l.loosePieces,
      })),
    })) as Json,
  });
  if (error) {
    console.error("dispatchRound", error);
    const result = messageFor(error);
    return { status: "error", message: result.status === "error" ? result.message : SAVE_FAILED };
  }
  refresh();
  return { status: "done", count: data.length };
}

export async function receiveDispatchAction(input: ReceiveInput): Promise<OrderResult> {
  await requireStaff();
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) {
    const unchecked = parsed.error.issues.some((i) => i.path[0] === "checked");
    return {
      status: "error",
      message: unchecked ? "أكّد إنك فحصت البضاعة قدام السائق" : "في رقم مش منطقي",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_dispatch", {
    p_dispatch_id: parsed.data.dispatchId,
    p_lines: parsed.data.lines.map((l) => ({
      dispatch_line_id: l.dispatchLineId,
      whole_cakes: l.wholeCakes,
      loose_pieces: l.loosePieces,
      note: l.note,
      damaged_whole: l.damagedWhole,
      damaged_loose: l.damagedLoose,
    })) as Json,
  });
  if (error) {
    console.error("receiveDispatch", error);
    return messageFor(error);
  }
  refresh();
  return { status: "done", id: data };
}

// ─── الأدمن ──────────────────────────────────────────────────────────

export async function decideRequestAction(requestId: string, approve: boolean): Promise<OrderResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(requestId).success || typeof approve !== "boolean") {
    return { status: "error", message: "الطلب مش موجود" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_decide_request", {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) return messageFor(error);
  refresh();
  return { status: "done", id: requestId };
}

const resolutionSchema = z.object({
  lineId: z.uuid(),
  resolution: z.enum(["waste", "review", "resolved"]),
  note: z.string().trim().max(300).default(""),
});

export async function resolveReceiptLineAction(
  input: z.input<typeof resolutionSchema>,
): Promise<OrderResult> {
  await requireAdmin();
  const parsed = resolutionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "القرار مش صحيح" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_receipt_line", {
    p_line_id: parsed.data.lineId,
    p_resolution: parsed.data.resolution,
    p_note: parsed.data.note || undefined,
  });
  if (error) return messageFor(error);
  refresh();
  return { status: "done", id: parsed.data.lineId };
}

/** الكمية المقترحة لفرع (للإخراج بدون طلب): الحد − الموجود لكل صنف. */
export async function branchSuggestionsAction(branchId: string): Promise<
  {
    productId: string;
    stockPieces: number;
    parPieces: number | null;
    avgPieces: number | null;
    minTomorrow: number | null;
  }[]
> {
  await requireStaff();
  if (!z.uuid().safeParse(branchId).success) return [];
  const supabase = await createClient();
  const [{ data, error }, mins] = await Promise.all([
    supabase.rpc("branch_suggestions", { p_branch_id: branchId }),
    supabase.rpc("branch_min_tomorrow", { p_branch_id: branchId }),
  ]);
  if (error) return [];
  const minById = new Map((mins.data ?? []).map((m) => [m.product_id, m.min_pieces]));
  return data.map((s) => ({
    productId: s.product_id,
    stockPieces: s.stock_pieces,
    parPieces: s.par_pieces,
    avgPieces: s.avg_pieces,
    minTomorrow: minById.get(s.product_id) ?? null,
  }));
}

const returnSchema = z.object({
  receiptLineId: z.uuid(),
  toStock: z.number().int().min(0).max(99999),
  toWaste: z.number().int().min(0).max(99999),
  productionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

/** قرار أمين المستودع على مرتجع: جزء للستوك على دفعة، وجزء تالف. */
export async function decideReturnAction(input: z.input<typeof returnSchema>): Promise<OrderResult> {
  await requireStaff();
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success || parsed.data.toStock + parsed.data.toWaste === 0) {
    return { status: "error", message: "اختار كم للستوك وكم تالف" };
  }
  if (parsed.data.toStock > 0 && !parsed.data.productionDate)
    return { status: "error", message: "اختار رقم الدفعة" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_return", {
    p_receipt_line_id: parsed.data.receiptLineId,
    p_to_stock_pieces: parsed.data.toStock,
    p_to_waste_pieces: parsed.data.toWaste,
    p_to_stock_production_date: parsed.data.productionDate ?? undefined,
  });
  if (error) return messageFor(error);
  refresh();
  return { status: "done", id: data };
}

/** إعداد التطليع بدون ستوك: الأدمن أو المدير العام (قاعدة البيانات بتفحص كمان). */
export async function setDispatchWithoutStockAction(on: boolean): Promise<SaveResult> {
  await requireManager();
  if (typeof on !== "boolean") return { status: "error", message: "القيمة مش صحيحة" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_factory_dispatch_without_stock", { p_on: on });
  if (error) {
    console.error("setDispatchWithoutStock", error);
    return { status: "error", message: error.code === "42501" ? "ما إلك صلاحية" : "ما انحفظ" };
  }
  refresh();
  return { status: "done" };
}
