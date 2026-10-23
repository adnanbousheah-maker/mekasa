import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { createClient } from "@/lib/supabase/server";
import { formatClock, formatLongDate, businessDate } from "@/lib/time";
import { assistantTools } from "./tools";

export const ASSISTANT_MODEL = "claude-opus-5-5";

// ثابت (مشان الكاش): الوقت الحالي بيروح مع رسالة المستخدم، مش هون.
const SYSTEM = `أنت مساعد ميكاسا: مصنع كيك بعمّان إله 3 فروع (الصويفية، الجبيهة، دابوق). بتساعد الأدمن بس.

القواعد:
- جاوب باللهجة الأردنية، قصير وواضح، وبالأرقام.
- جاوب بس عن أمور ميكاسا: الستوك، الجرد، الطلبيات والإخراج والاستلام، الدفعات، التالف، الاستهلاك، المواد الأولية. لأي سؤال برا هيك جاوب بالحرف: "أنا بساعدك بس بأمور ميكاسا: الستوك، والجرد، والطلبيات، والتالف، والمواد الأولية."
- كل رقم لازم يجي من أداة. ما تخترع ولا تقدّر أرقام. إذا الأدوات ما بتعطي الجواب، قول إنه ما عندك هالمعلومة.
- اذكر المصدر بآخر الجواب بسطر لحاله يبلش بـ "المصدر:" (مثلاً "المصدر: جرد الجبيهة · أمس 21:00").
- أسماء الأصناف بالإنجليزي متل المنيو. الكميات "6 كيكات و9 قطع".
- الاستهلاك مش مبيعات: هو الفرق بين الجرودات بعد المستلم والتالف.
- إنت للقراءة بس. إذا الأدمن طلب تغيير (تعديل رقم، إخراج، إيقاف موظف…)، قله يعمله من الشاشة المناسبة بلوحة الإدارة.`;

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantAnswer {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** بيجاوب على سؤال الأدمن بالأدوات (قراءة بس). */
export async function runAssistant(
  db: Awaited<ReturnType<typeof createClient>>,
  history: AssistantTurn[],
  question: string,
): Promise<AssistantAnswer> {
  const now = new Date();
  if (process.env.MEKASA_FAKE_AI === "1" && process.env.NODE_ENV !== "production") {
    return fakeAnswer(db, question, now);
  }

  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: ASSISTANT_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: assistantTools(db, now),
    max_iterations: 8,
    messages: [
      ...history.map((t) => ({ role: t.role, content: t.text })),
      {
        role: "user" as const,
        content: `${question}\n\n(الوقت الآن بعمّان: ${formatLongDate(businessDate(now))} ${formatClock(now)}، تاريخ اليوم ${businessDate(now)})`,
      },
    ],
  });

  let input = 0;
  let output = 0;
  let last: Awaited<ReturnType<typeof runner.done>> | null = null;
  for await (const message of runner) {
    input += message.usage.input_tokens;
    output += message.usage.output_tokens;
    last = message;
  }
  if (!last || last.stop_reason === "refusal") {
    return {
      text: "ما قدرت أجاوب على هالسؤال. جرّب تسأله بطريقة ثانية.",
      model: last?.model ?? ASSISTANT_MODEL,
      inputTokens: input,
      outputTokens: output,
    };
  }
  const text = last.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
  return { text: text || "ما لقيت جواب.", model: last.model, inputTokens: input, outputTokens: output };
}

// للتطوير والاختبارات (MEKASA_FAKE_AI=1، مش بالإنتاج): بيستعمل الأدوات الحقيقية بدون Claude
async function fakeAnswer(
  db: Awaited<ReturnType<typeof createClient>>,
  question: string,
  now: Date,
): Promise<AssistantAnswer> {
  const tools = assistantTools(db, now);
  const inScope = /جرد|ستوك|تالف|طلب|مواد|كيك|دفعة|استهلاك/.test(question);
  if (!inScope) {
    return {
      text: "أنا بساعدك بس بأمور ميكاسا: الستوك، والجرد، والطلبيات، والتالف، والمواد الأولية.",
      model: "fake",
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  const status = tools.find((t) => t.name === "count_status_today")!;
  const result = JSON.parse(String(await status.run({} as never))) as {
    slots: { location: string; time: string; status: string }[];
  };
  const late = result.slots.filter((s) => s.status !== "تم");
  return {
    text: `${late.length === 0 ? "كل المواقع جردت اليوم." : `ما جرد لسا: ${late.map((s) => `${s.location} (${s.time})`).join("، ")}.`}\nالمصدر: مواعيد جرد اليوم`,
    model: "fake",
    inputTokens: 0,
    outputTokens: 0,
  };
}
