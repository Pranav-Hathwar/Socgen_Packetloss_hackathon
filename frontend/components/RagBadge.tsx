import type { RAG } from "../types/vendor";

const palette: Record<RAG, { bg: string; text: string; border: string; dot: string }> = {
  RED: { bg: "bg-rag-red/10", text: "text-rag-red", border: "border-rag-red/25", dot: "bg-rag-red" },
  AMBER: { bg: "bg-rag-amber/10", text: "text-rag-amber", border: "border-rag-amber/25", dot: "bg-rag-amber" },
  GREEN: { bg: "bg-rag-green/10", text: "text-rag-green", border: "border-rag-green/25", dot: "bg-rag-green" },
};

interface RagBadgeProps {
  rag: RAG;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}

export function RagBadge({ rag, size = "sm", pulse = false }: RagBadgeProps) {
  const p = palette[rag];
  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold tracking-wide ${p.bg} ${p.text} ${p.border} ${sizeClasses[size]} ${
        pulse && rag === "RED" ? "animate-pulse-glow" : ""
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {rag}
    </span>
  );
}
