import { useRouter } from "next/router";
import { useState, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export default function AuditChat() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const vendorId = typeof router.query.vendor_id === "string"
    ? router.query.vendor_id
    : undefined;

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: vendorId
        ? `Hi! I'm your VendorLens assistant. Ask me anything about vendor ${vendorId}.`
        : "Hi! I'm your VendorLens assistant. Ask me anything about your vendors.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Guard: redirect to login if no user
  useEffect(() => {
    if (!user && typeof window !== "undefined") {
      const stored = sessionStorage.getItem("vl_token");
      if (!stored) router.replace("/login");
    }
  }, [user, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.ask({ question: q, vendor_id: vendorId });
      setMessages((prev) => [...prev, { role: "assistant", text: res.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-indigo-600 text-sm hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-bold text-gray-900">
            Audit Chat{vendorId ? ` — ${vendorId}` : ""}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{user.email}</span>
          <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {user.role}
          </span>
          <button
            onClick={() => { logout(); router.replace("/login"); }}
            className="text-gray-400 hover:text-gray-700"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto w-full flex flex-col flex-1 p-6">
        <div className="flex-1 bg-white rounded-xl shadow p-4 overflow-y-auto space-y-4 min-h-[400px]">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-500 px-4 py-2 rounded-2xl rounded-bl-sm text-sm animate-pulse">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a vendor's risk posture…"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
