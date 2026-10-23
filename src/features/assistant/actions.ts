"use server";

import { z } from "zod";
import { requireAdmin } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ASSISTANT_MODEL, runAssistant, type AssistantTurn } from "./run";

export type AskResult =
  { status: "error"; message: string } | { status: "done"; conversationId: string; answer: string };

const askSchema = z.object({
  conversationId: z.uuid().nullable(),
  question: z.string().trim().min(1, "اكتب سؤالك").max(1000, "السؤال طويل كثير"),
  voice: z.boolean().default(false),
});

/**
 * سؤال للمساعد. الأدوات بتقرأ بجلسة الأدمن (RLS)، والمحادثة بتنحفظ (الرسائل وسجل التكلفة
 * بـ service role لأنه ما في policy كتابة عليهم للتطبيق).
 */
export async function askAssistantAction(input: z.input<typeof askSchema>): Promise<AskResult> {
  const admin = await requireAdmin();
  const parsed = askSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "السؤال مش صحيح" };
  const { question, voice } = parsed.data;

  const db = await createClient();
  const service = createAdminClient();
  let conversationId = parsed.data.conversationId;
  let history: AssistantTurn[] = [];

  if (conversationId) {
    // RLS: الأدمن بيقرأ محادثاته بس. لازم نتأكد قبل ما نكتب فيها بـ service role.
    const { data: own } = await db
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!own) return { status: "error", message: "المحادثة مش موجودة" };
    const { data, error } = await db
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(20);
    if (error || !data) return { status: "error", message: "المحادثة مش موجودة" };
    history = data.reverse().map((m) => ({
      role: m.role as AssistantTurn["role"],
      text: String((m.content as { text?: string }).text ?? ""),
    }));
  } else {
    const { data, error } = await db
      .from("ai_conversations")
      .insert({ staff_id: admin.id, title: question.slice(0, 120) })
      .select("id")
      .single();
    if (error) return { status: "error", message: "ما قدرت أبلش محادثة" };
    conversationId = data.id;
  }

  const started = Date.now();
  try {
    const answer = await runAssistant(db, history, question);
    await service.from("ai_messages").insert([
      { conversation_id: conversationId, role: "user", content: { text: question, voice } },
      { conversation_id: conversationId, role: "assistant", content: { text: answer.text } },
    ]);
    await service.from("ai_usage_log").insert({
      feature: "assistant",
      staff_id: admin.id,
      model: answer.model,
      input_tokens: answer.inputTokens,
      output_tokens: answer.outputTokens,
      duration_ms: Date.now() - started,
    });
    return { status: "done", conversationId, answer: answer.text };
  } catch (error) {
    console.error("assistant", error);
    await service.from("ai_usage_log").insert({
      feature: "assistant",
      staff_id: admin.id,
      model: ASSISTANT_MODEL,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      duration_ms: Date.now() - started,
    });
    return { status: "error", message: "المساعد مش متاح هلا. جرب بعد شوي." };
  }
}
