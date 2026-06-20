import { useRouter } from "next/router";
import { useState, useRef, useEffect, FormEvent, Fragment } from "react";
import Link from "next/link";
import {
  PaperAirplaneIcon,
  SparklesIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { api } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  source?: string;
}

const SUGGESTED_QUESTIONS = [
  "What happens if our primary cloud vendor (Acme) suffers a data breach?",
  "Which vendors have expiring certifications in the next 90 days?",
  "Show me all vendors with HIGH concentration risk and no alternative identified",
  "Which vendors are non-compliant with GDPR and handle EU citizen data?",
];

function parseVendorLinks(text: string) {
  // Match vendor IDs like V001, V002, etc.
  const parts = text.split(/(V\d{3})/g);
  return parts.map((part, i) => {
    if (/^V\d{3}$/.test(part)) {
      return (
        <Link
          key={i}
          href={`/vendors/${part}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-semibold hover:bg-indigo-200 transition-colors"
        >
          {part}
          <span className="text-[10px]">→</span>
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function AuditChat() {
  const router = useRouter();
  const vendorId =
    typeof router.query.vendor_id === "string" ? router.query.vendor_id : undefined;

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: vendorId
        ? `Hi! I'm your VendorLens AI co-pilot. Ask me anything about vendor ${vendorId}.`
        : "Hi! I'm your VendorLens AI co-pilot. Ask me anything about your vendor portfolio risk.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: q, timestamp: new Date() }]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.ask({ question: q, vendor_id: vendorId });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.answer, timestamp: new Date(), source: res.sources?.[0] },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${String(err)}`, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSuggest(q: string) {
    setInput(q);
  }

  function clearChat() {
    setMessages([
      {
        role: "assistant",
        text: "Chat cleared. Ask me anything about your vendor portfolio.",
        timestamp: new Date(),
      },
    ]);
  }

  function copyMessage(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                Audit Co-Pilot{vendorId ? ` — ${vendorId}` : ""}
              </h1>
              <p className="text-xs text-slate-500">AI-powered vendor risk analysis</p>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
            >
              <div className="group max-w-[85%]">
                <div
                  className={`px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-indigo-600 text-white rounded-2xl rounded-br-md"
                      : "bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-md shadow-sm"
                  }`}
                >
                  {m.role === "assistant" ? parseVendorLinks(m.text) : m.text}
                </div>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[10px] text-slate-400">
                    {m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {m.source && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      m.source === "claude-haiku"
                        ? "bg-violet-100 text-violet-600"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {m.source === "claude-haiku" ? "claude haiku" : "deterministic"}
                    </span>
                  )}
                  {m.role === "assistant" && i > 0 && (
                    <button
                      onClick={() => copyMessage(m.text, i)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600"
                    >
                      {copiedIdx === i ? (
                        <CheckIcon className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <ClipboardDocumentIcon className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 text-slate-500 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm text-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs">Thinking…</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggested Questions */}
      {messages.length <= 2 && (
        <div className="px-6 pb-3">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
              Suggested Questions
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggest(q)}
                  className="text-left px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-slate-100 bg-white/80 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about vendor risk posture, compliance gaps, or mitigation strategies…"
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:bg-white transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-all flex items-center gap-2"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
