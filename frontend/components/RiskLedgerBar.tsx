import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ScoreBreakdown } from "../types/vendor";

const DIMENSIONS: { key: keyof ScoreBreakdown; label: string; color: string }[] = [
  { key: "data_exposure", label: "Data Exposure", color: "#3B4D7A" },
  { key: "compliance_gaps", label: "Compliance Gaps", color: "#A8801C" },
  { key: "breach_history", label: "Breach History", color: "#DC2626" },
  { key: "financial_health", label: "Financial Health", color: "#0F766E" },
  { key: "concentration", label: "Concentration", color: "#C2700A" },
];

function useRollingNumber(target: number, reduce: boolean | null) {
  const [val, setVal] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) { setVal(target); return; }
    let raf = 0;
    const start = performance.now();
    const from = val;
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce]);
  return val;
}

interface Props {
  breakdown: ScoreBreakdown;
  score: number;
  /** previous score for what-if before→after delta */
  previousScore?: number;
  compact?: boolean;
}

export function RiskLedgerBar({ breakdown, score, previousScore, compact = false }: Props) {
  const reduce = useReducedMotion();
  const segs = DIMENSIONS.map((d) => ({ ...d, value: Math.max(0, Number(breakdown?.[d.key] ?? 0)) }));
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  const rolling = useRollingNumber(score, reduce);
  const delta = previousScore != null ? score - previousScore : null;

  return (
    <div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Explainable Risk Score</p>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold text-ink tabular">{rolling.toFixed(0)}</span>
            <span className="text-sm text-slate-400">/ 100</span>
            {delta != null && delta !== 0 && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-xs font-semibold tabular px-1.5 py-0.5 rounded-md ${
                  delta < 0 ? "bg-rag-green/10 text-rag-green" : "bg-rag-red/10 text-rag-red"
                }`}
              >
                {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(1)}
              </motion.span>
            )}
          </div>
        </div>
      </div>

      {/* Segmented ledger bar */}
      <div className={`flex w-full ${compact ? "h-3" : "h-5"} rounded-md overflow-hidden ring-1 ring-hairline bg-slate-100`}>
        {segs.map((s, i) => (
          <motion.div
            key={s.key}
            initial={{ width: reduce ? `${(s.value / total) * 100}%` : 0 }}
            animate={{ width: `${(s.value / total) * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.08, ease: "easeOut" }}
            style={{ backgroundColor: s.color }}
            title={`${s.label}: ${s.value.toFixed(1)}`}
            className="h-full"
          />
        ))}
      </div>

      {/* Legend */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-2 mt-4">
          {segs.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] text-slate-600 leading-tight truncate">{s.label}</span>
              <span className="text-[11px] font-semibold text-ink tabular ml-auto">{s.value.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
