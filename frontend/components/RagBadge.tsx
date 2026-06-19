import type { RAG } from "../types/vendor";

const palette: Record<RAG, string> = {
  RED: "bg-red-100 text-red-700 border-red-300",
  AMBER: "bg-amber-100 text-amber-700 border-amber-300",
  GREEN: "bg-green-100 text-green-700 border-green-300",
};

export function RagBadge({ rag }: { rag: RAG }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${palette[rag]}`}
    >
      {rag}
    </span>
  );
}
