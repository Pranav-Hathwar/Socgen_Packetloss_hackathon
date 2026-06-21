import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip,
} from "recharts";
import type { ScoreBreakdown } from "../types/vendor";

const DIMENSIONS: { key: keyof ScoreBreakdown; label: string; short: string; color: string }[] = [
  { key: "data_exposure", label: "Data Exposure", short: "Data", color: "#3B4D7A" },
  { key: "compliance_gaps", label: "Compliance Gaps", short: "Compliance", color: "#A8801C" },
  { key: "breach_history", label: "Breach History", short: "Breach", color: "#DC2626" },
  { key: "financial_health", label: "Financial Health", short: "Financial", color: "#0F766E" },
  { key: "concentration", label: "Concentration", short: "Concentr.", color: "#C2700A" },
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
  previousScore?: number;
  compact?: boolean;
}

export function RiskLedgerBar({ breakdown, score, previousScore, compact = false }: Props) {
  const reduce = useReducedMotion();
  const segs = DIMENSIONS.map((d) => ({ ...d, value: Math.max(0, Number(breakdown?.[d.key] ?? 0)) }));
  const maxVal = Math.max(100, ...segs.map((s) => s.value));
  const rolling = useRollingNumber(score, reduce);
  const delta = previousScore != null ? score - previousScore : null;
  const topDriver = [...segs].sort((a, b) => b.value - a.value)[0];
  const radarData = segs.map((s) => ({ subject: s.short, value: s.value, fullMark: 100 }));

  return (
    <div>
      {/* Score header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Explainable Risk Score</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-display text-4xl font-bold text-ink tabular">{rolling.toFixed(0)}</span>
            <span className="text-sm text-slate-400">/ 100</span>
            {delta != null && delta !== 0 && (
              <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className={`text-xs font-semibold tabular px-1.5 py-0.5 rounded-md ${delta < 0 ? "bg-rag-green/10 text-rag-green" : "bg-rag-red/10 text-rag-red"}`}>
                {delta < 0 ? "down" : "up"} {Math.abs(delta).toFixed(1)}
              </motion.span>
            )}
          </div>
        </div>
        {topDriver && topDriver.value > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Top Driver</p>
            <p className="text-xs font-semibold mt-0.5" style={{ color: topDriver.color }}>{topDriver.label}</p>
          </div>
        )}
      </div>

      {/* Two graphs side by side: contribution bars + risk-profile radar */}
      <div className={`grid grid-cols-1 ${compact ? "" : "lg:grid-cols-2"} gap-6 items-center`}>
        {/* Horizontal contribution bars */}
        <div className="space-y-3">
          {segs.map((s, i) => (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-600 truncate">{s.label}</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden ring-1 ring-hairline/60">
                <motion.div
                  initial={{ width: reduce ? `${(s.value / maxVal) * 100}%` : 0 }}
                  animate={{ width: `${(s.value / maxVal) * 100}%` }}
                  transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  style={{ backgroundColor: s.color }}
                  className="h-full rounded-full"
                />
              </div>
              <span className="w-9 shrink-0 text-right text-xs font-semibold text-ink tabular">{s.value.toFixed(0)}</span>
            </div>
          ))}
        </div>

        {/* Risk-profile radar */}
        {!compact && (
          <div className="h-[230px] -mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#DBE0E8" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#5A6478" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #DBE0E8", fontSize: "12px" }} formatter={(v: number) => [`${Number(v).toFixed(0)} / 100`, "Risk"]} />
                <Radar dataKey="value" stroke="#0F766E" fill="#0F766E" fillOpacity={0.22} strokeWidth={2} isAnimationActive={!reduce} animationDuration={700} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {!compact && (
        <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
          Bars show each factor&apos;s contribution to the score; the radar shows the overall risk profile shape. Both update live in the What-If simulator.
        </p>
      )}
    </div>
  );
}
