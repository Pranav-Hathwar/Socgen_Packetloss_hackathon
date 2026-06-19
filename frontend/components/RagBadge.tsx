import type { RAG } from "../types/vendor";

const palette: Record<RAG, { bg: string; text: string; border: string; dot: string }> = {
  RED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  AMBER: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  GREEN: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
};

interface RagBadgeProps {
  rag: RAG;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}

export function RagBadge({ rag, size = "sm", pulse = false }: RagBadgeProps) {
  const p = palette[rag];
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${p.bg} ${p.text} ${p.border} ${sizeClasses[size]} ${
        pulse && rag === "RED" ? "animate-pulse-glow" : ""
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {rag}
    </span>
  );
}
