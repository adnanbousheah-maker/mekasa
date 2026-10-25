"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/features/auth/session";
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
        ? { batches: l.batches.map((b) => ({ production_date: b.productionDate, qty_pieces: b.qty })) }
        : {}),
    })) as Json,
  });
  if (error) {
    if (error.hint !== "fefo_override") console.error("createDispatch", error);
    return messageFor(error);
  }
  refresh();
  return { status: "done", id: data };
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
export async function branchSuggestionsAction(
  branchId: string,
): Promise<{ productId: string; stockPieces: number; parPieces: number | null; avgPieces: number | null }[]> {
  await requireStaff();
  if (!z.uuid().safeParse(branchId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("branch_suggestions", { p_branch_id: branchId });
  if (error) return [];
  return data.map((s) => ({
    productId: s.product_id,
    stockPieces: s.stock_pieces,
    parPieces: s.par_pieces,
    avgPieces: s.avg_pieces,
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
