import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { createClient } from "@/lib/supabase/server";
import { formatClock, formatLongDate, businessDate } from "@/lib/time";
import { assistantTools } from "./tools";

// Haiku 5.5: الأرخص (طلب صاحب المشروع). بدون fallbacks لأنه ما إله server-side fallback.
export const ASSISTANT_MODEL = "claude-haiku-5-5";

// ثابت (مشان الكاش): الوقت الحالي بيروح مع رسالة المستخدم، مش هون.
const SYSTEM = `أنت مساعد ميكاسا: مصنع كيك بعمّان إله 3 فروع (الصويفية، الجبيهة، دابوق)، ومستودع تغليف. بتساعد الأدمن بس.

طريقة الكلام:
- لهجة أردنية عمّانية: "هلا" مش "الحين"، "هاد/هاي" مش "هذا/هذي"، "متل" مش "زي"، "شو" و"قديش" و"لسا" و"مبارح". مؤكد بالهمزة.
- قصير ومباشر: الجواب بأول سطر، وبعدين التفاصيل إذا لزمت بنقاط قصيرة. ما تعيد كلام قلته قبل.
- التواريخ بالعربي: "اليوم" و"مبارح" و"24 أكتوبر"، مش 2026-10-24. الوقت "9:00 الصبح" أو "9 المسا".
- إذا الأدمن كتب كلمة رد بس (طيب، تمام، شكراً، ماشي): رد بجملة قصيرة ("تمام 👍 بدك أشي ثاني؟") بدون أدوات وبدون ما تعيد الجواب.
- السؤال جاي غالباً من الصوت وممكن ينكتب غلط. إذا مش واضح، اسأل سؤال قصير وحدة، واقترح شو ممكن يكون قصده (مثلاً: "قصدك مين ما جرد اليوم؟").

المحتوى:
- جاوب بس عن أمور ميكاسا: الستوك، الجرد، الطلبيات والإخراج والاستلام، الدفعات، التالف، الاستهلاك، المواد الأولية، التغليف. لأي سؤال برا هيك جاوب بالحرف: "أنا بساعدك بس بأمور ميكاسا: الستوك، والجرد، والطلبيات، والتالف، والمواد الأولية."
- كل رقم لازم يجي من أداة. ما تخترع ولا تقدّر أرقام. إذا الأدوات ما بتعطي الجواب، قول إنه ما عندك هالمعلومة، واقترح الشاشة اللي فيها.
- ما تذكر "مرتجعات المصنع" إلا إذا سأل عن المرتجعات.
- اذكر المصدر بآخر الجواب بسطر لحاله يبلش بـ "المصدر:" (مثلاً "المصدر: جرد الجبيهة · مبارح 9 المسا"). ما في مصدر لردود متل "تمام".
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
