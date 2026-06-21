import { useRouter } from "next/router";
import { useState, useRef, useEffect, FormEvent, Fragment } from "react";
import Link from "next/link";
import {
  PaperAirplaneIcon,
  SparklesIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ShieldExclamationIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  GlobeEuropeAfricaIcon,
  ChartBarIcon,
  ArrowPathIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import { api } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

interface Suggestion {
  q: string;
  icon: typeof ShieldExclamationIcon;
}

// Portfolio-wide questions — exercise the structured-filter + semantic RAG paths.
const PORTFOLIO_SUGGESTIONS: Suggestion[] = [
  { q: "How many vendors are under active investigation?", icon: ExclamationTriangleIcon },
  { q: "List all vendors with breach history, highest risk first", icon: ShieldExclamationIcon },
  { q: "Which vendors are missing SOC 2 and handle HIGH sensitivity data?", icon: DocumentMagnifyingGlassIcon },
  { q: "Show all vendors with HIGH concentration risk", icon: ChartBarIcon },
  { q: "Which non-EU vendors hold our most sensitive data?", icon: GlobeEuropeAfricaIcon },
  { q: "Who are the top 5 riskiest vendors and why?", icon: BuildingOffice2Icon },
];

// Vendor-scoped questions — shown when chat is opened for a specific vendor.
const VENDOR_SUGGESTIONS: Suggestion[] = [
  { q: "Summarise this vendor's biggest risk drivers", icon: ShieldExclamationIcon },
  { q: "What compliance gaps does this vendor have?", icon: DocumentMagnifyingGlassIcon },
  { q: "What's the single most urgent remediation right now?", icon: ExclamationTriangleIcon },
  { q: "Is this vendor safe to renew?", icon: CheckIcon },
];

// Generic deepeners — surfaced as follow-ups once the curated set runs low.
const PORTFOLIO_FOLLOWUPS: Suggestion[] = [
  { q: "Which of these should we prioritise first?", icon: ChartBarIcon },
  { q: "Recommend remediation steps for the highest-risk vendors", icon: DocumentMagnifyingGlassIcon },
  { q: "Break the portfolio risk down by category", icon: BuildingOffice2Icon },
  { q: "Which vendors have expired or expiring certifications?", icon: ExclamationTriangleIcon },
  { q: "What is our overall GDPR compliance coverage?", icon: GlobeEuropeAfricaIcon },
];

const VENDOR_FOLLOWUPS: Suggestion[] = [
  { q: "What's a realistic remediation timeline for this vendor?", icon: ChartBarIcon },
  { q: "What happens if we take no action?", icon: ExclamationTriangleIcon },
  { q: "Does this vendor have any breach history?", icon: ShieldExclamationIcon },
  { q: "What contract terms should we renegotiate?", icon: DocumentMagnifyingGlassIcon },
];

// Match vendor IDs of any shape that contain a digit: V103, VAC2803, V02B9DA.
const VENDOR_ID_RE = /(\bV(?=[0-9A-Z]*\d)[0-9A-Z]{2,}\b)/g;

function parseVendorLinks(text: string) {
  const parts = text.split(VENDOR_ID_RE);
  return parts.map((part, i) => {
    if (/^V(?=[0-9A-Z]*\d)[0-9A-Z]{2,}$/.test(part)) {
      return (
        <Link
          key={i}
          href={`/vendors/${part}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-semibold hover:bg-teal/30 transition-colors"
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

  const greeting = vendorId
    ? `I'm scoped to vendor ${vendorId}. Ask me about its risk posture, compliance gaps, or remediation — I'll answer only from this vendor's data.`
    : "I'm your VendorLens audit co-pilot. Ask me anything about your vendor portfolio — risk, compliance, breaches, concentration. Name a vendor and I'll focus on it.";

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: greeting, timestamp: new Date() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseSuggestions = vendorId ? VENDOR_SUGGESTIONS : PORTFOLIO_SUGGESTIONS;
  const followUpPool = vendorId ? VENDOR_FOLLOWUPS : PORTFOLIO_FOLLOWUPS;

  // Questions already asked this session — never recommend them again.
  const asked = new Set(
    messages.filter((m) => m.role === "user").map((m) => m.text.trim().toLowerCase())
  );

  // Build the recommendation list: curated questions first, topped up with
  // generic deepeners, always excluding anything already asked. Capped at 4.
  const recommendations = [...baseSuggestions, ...followUpPool]
    .filter((s) => !asked.has(s.q.trim().toLowerCase()))
    .slice(0, 4);

  const lastMsg = messages[messages.length - 1];
  const showRecommendations =
    !loading && lastMsg?.role === "assistant" && recommendations.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: q, timestamp: new Date() }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.ask({ question: q, vendor_id: vendorId });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.answer, timestamp: new Date() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Sorry — something went wrong: ${String(err)}`, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function clearChat() {
    setMessages([{ role: "assistant", text: greeting, timestamp: new Date() }]);
    inputRef.current?.focus();
  }

  function copyMessage(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const isFirstTurn = messages.length <= 1;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal/30">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-ink">Audit Co-Pilot</h1>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                    vendorId
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${vendorId ? "bg-amber-500" : "bg-emerald-500"}`} />
                  {vendorId ? `Scoped: ${vendorId}` : "Portfolio-wide"}
                </span>
                <span className="text-[10px] text-slate-400">grounded on live vendor data</span>
              </div>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="btn-liquid flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
            >
              {m.role === "assistant" && (
                <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <SparklesIcon className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`group max-w-[80%] ${m.role === "user" ? "items-end" : ""}`}>
                <div
                  className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-teal-600 text-white rounded-2xl rounded-br-md"
                      : "bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-md shadow-sm"
                  }`}
                >
                  {m.role === "assistant" ? parseVendorLinks(m.text) : m.text}
                </div>
                <div className={`flex items-center gap-2 mt-1 px-1 ${m.role === "user" ? "justify-end" : ""}`}>
                  <span className="text-[10px] text-slate-400">
                    {m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {m.role === "assistant" && i > 0 && (
                    <button
                      onClick={() => copyMessage(m.text, i)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600"
                      title="Copy"
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
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-teal-600 flex items-center justify-center shadow-sm">
                <SparklesIcon className="w-4 h-4 text-white animate-pulse" />
              </div>
              <div className="bg-white border border-slate-200 text-slate-500 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm text-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs">Analysing vendor data…</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggested / follow-up questions — refreshed after every answer */}
      {showRecommendations && (
        <div className="px-6 pb-3 animate-fade-in">
          <div className="max-w-3xl mx-auto">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
              {isFirstTurn
                ? vendorId
                  ? "Ask about this vendor"
                  : "Try asking"
                : "Follow-up questions"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recommendations.map(({ q, icon: Icon }, i) => (
                <button
                  key={`${q}-${i}`}
                  onClick={() => send(q)}
                  className="group flex items-start gap-2.5 text-left px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 hover:bg-teal-50 hover:border-teal/40 hover:shadow-sm transition-all"
                >
                  <span className="mt-0.5 w-6 h-6 shrink-0 rounded-lg bg-slate-100 group-hover:bg-teal-100 flex items-center justify-center transition-colors">
                    <Icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-600" />
                  </span>
                  <span className="leading-snug pt-0.5">{q}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-slate-100 bg-white/80 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                vendorId
                  ? `Ask about vendor ${vendorId}…`
                  : "Ask about risk, compliance gaps, or name a vendor…"
              }
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal-600 focus:bg-white transition-all"
              disabled={loading}
            />
            {input && !loading && (
              <button
                type="button"
                onClick={() => setInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                title="Clear input"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-liquid px-5 py-3 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-40 transition-all flex items-center gap-2"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            Send
          </button>
        </form>
        <p className="max-w-3xl mx-auto mt-2 text-[10px] text-slate-400 text-center">
          Answers are generated from your vendor register. Verify before acting on audit decisions.
        </p>
      </div>
    </div>
  );
}
