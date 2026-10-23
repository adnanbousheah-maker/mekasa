"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askAssistantAction } from "../actions";

type Message = { role: "user" | "assistant"; text: string; voice?: boolean };

const SUGGESTIONS = ["مين ما جرد اليوم؟", "شو تحت الحد المطلوب؟", "التالف هالأسبوع"];

// Web Speech API (بالمتصفح، مش بكل المتصفحات)
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** design/admin/AdminAI: أسئلة بالكتابة أو بالصوت، والأجوبة من بيانات التطبيق بس. */
export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAsking, startTransition] = useTransition();
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVoiceSupported(speechRecognition() !== null));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, isAsking]);

  const ask = (question: string, voice = false) => {
    const q = question.trim();
    if (!q || isAsking) return;
    setMessages((m) => [...m, { role: "user", text: q, voice }]);
    setText("");
    setError(null);
    startTransition(async () => {
      const result = await askAssistantAction({ conversationId, question: q, voice });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setConversationId(result.conversationId);
      setMessages((m) => [...m, { role: "assistant", text: result.answer }]);
    });
  };

  const toggleMic = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = speechRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "ar-JO";
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ");
      ask(said, true);
    };
    r.onerror = () => setError("ما سمعتك منيح. جرب كمان مرة أو اكتب سؤالك.");
    r.onend = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  };

  return (
    <section
      aria-label="مساعد ميكاسا"
      className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-ink text-lg text-white"
        >
          ✦
        </span>
        <div className="flex grow flex-col">
          <span className="text-[17px] font-bold">مساعد ميكاسا</span>
          <span className="text-[13px] text-muted">بيجاوب من بيانات التطبيق بس، وما بيغير شي</span>
        </div>
      </div>

      <div className="flex grow flex-col gap-3 overflow-y-auto px-5 py-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="m-auto max-w-sm text-center text-[15px] text-muted">
            اسأل عن الستوك، الجرد، الطلبيات، الدفعات، التالف، أو المواد الأولية. بالكتابة أو بالصوت.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="flex max-w-[80%] flex-col gap-0.5 self-start rounded-2xl rounded-ss-sm bg-ink px-4 py-2.5 text-white"
            >
              {m.voice && <span className="text-[11px] text-white/70">رسالة صوتية</span>}
              <span className="text-[15px]">{m.text}</span>
            </div>
          ) : (
            <div
              key={i}
              className="flex max-w-[85%] flex-col gap-1.5 self-end rounded-2xl rounded-se-sm bg-quiet px-4 py-3"
            >
              {m.text.split("\n").map((line, j) =>
                line.startsWith("المصدر:") ? (
                  <span key={j} className="text-xs text-muted">
                    {line}
                  </span>
                ) : (
                  <span key={j} dir="auto" className="text-[15px] leading-relaxed">
                    {line}
                  </span>
                ),
              )}
            </div>
          ),
        )}
        {isAsking && (
          <div role="status" className="self-end rounded-2xl bg-quiet px-4 py-3 text-sm text-muted">
            عم بدوّر…
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isAsking}
              onClick={() => ask(s)}
              className="h-9 rounded-full border border-line-strong px-3.5 text-[13px] disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={listening ? "عم بسمعك…" : "اسأل عن أي شي بميكاسا"}
            aria-label="اكتب سؤالك"
            maxLength={1000}
            className="h-14 grow rounded-[14px] border border-line-strong bg-surface px-4 text-base outline-none focus:border-ink"
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? "وقّف التسجيل" : "اسأل بالصوت"}
              className={`flex size-14 items-center justify-center rounded-full text-white ${listening ? "bg-danger shadow-[0_0_0_6px] shadow-danger/20" : "bg-ink"}`}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={isAsking || !text.trim()}
            className="h-14 rounded-[14px] bg-ink px-5 font-semibold text-white disabled:opacity-40"
          >
            اسأل
          </button>
        </form>
      </div>
    </section>
  );
}
