import { useMemo } from "react";
import { computeMoodStats } from "@wall/shared";
import { useBoardStore } from "../../stores/useBoardStore";

export function MoodBar() {
  const comments = useBoardStore((s) => s.comments);

  const stats = useMemo(
    () => computeMoodStats(Array.from(comments.values())),
    [comments],
  );

  if (stats.total === 0) {
    return (
      <div className="w-[420px] max-w-[56vw] h-7 rounded-full bg-slate-200/70 flex items-center justify-center text-[11px] text-slate-500">
        暂无情绪统计 · 点击画布写下第一条建议
      </div>
    );
  }

  return (
    <div
      className="w-[440px] max-w-[58vw] h-7 rounded-full overflow-hidden flex shadow-xs bg-slate-200/60 text-[11px] font-medium select-none"
      title={`正向 ${stats.positive} 条 · 中性 ${stats.neutral} 条 · 负面 ${stats.negative} 条`}
    >
      {stats.positivePct > 0 && (
        <div
          style={{ width: `${stats.positivePct}%` }}
          className="h-full bg-[#68d391] text-emerald-950 flex items-center justify-center transition-all duration-500 overflow-hidden whitespace-nowrap px-1.5"
        >
          {stats.positivePct >= 14 ? `正向 ${stats.positivePct}%` : `${stats.positivePct}%`}
        </div>
      )}
      {stats.neutralPct > 0 && (
        <div
          style={{ width: `${stats.neutralPct}%` }}
          className="h-full bg-[#cbd5e1] text-slate-700 flex items-center justify-center transition-all duration-500 overflow-hidden whitespace-nowrap px-1.5"
        >
          {stats.neutralPct >= 14 ? `中性 ${stats.neutralPct}%` : `${stats.neutralPct}%`}
        </div>
      )}
      {stats.negativePct > 0 && (
        <div
          style={{ width: `${stats.negativePct}%` }}
          className="h-full bg-[#f87171] text-white flex items-center justify-center transition-all duration-500 overflow-hidden whitespace-nowrap px-1.5"
        >
          {stats.negativePct >= 14 ? `负面 ${stats.negativePct}%` : `${stats.negativePct}%`}
        </div>
      )}
    </div>
  );
}
