import { useState, type ReactNode } from "react";
import {
  SOCKET_EVENTS,
  type BoardLayoutDTO,
  type LayoutMode,
  type ToolMode,
} from "@wall/shared";
import { emitWithAck } from "../../lib/socket";
import { useBoardStore } from "../../stores/useBoardStore";
import { MAX_SCALE, MIN_SCALE, useViewportStore } from "../../stores/useViewportStore";

const TOOLS: { mode: ToolMode; label: string; tip: string; icon: ReactNode }[] = [
  {
    mode: "create",
    label: "新增",
    tip: "点击画布任意空白处新建贴纸",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    mode: "like",
    label: "点赞",
    tip: "点击他人卡片快速点赞 / 取消点赞",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 20.5l-1.35-1.23C5.6 14.7 2.5 11.9 2.5 8.5 2.5 5.7 4.7 3.5 7.5 3.5c1.6 0 3.1.75 4.5 2 1.4-1.25 2.9-2 4.5-2 2.8 0 5 2.2 5 5 0 3.4-3.1 6.2-8.15 10.77L12 20.5z"
        />
      </svg>
    ),
  },
  {
    mode: "drag",
    label: "拖动",
    tip: "拖动自己的贴纸卡片调整位置",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"
        />
      </svg>
    ),
  },
];

export function Toolbar() {
  const toolMode = useBoardStore((s) => s.toolMode);
  const setToolMode = useBoardStore((s) => s.setToolMode);
  const layoutMode = useBoardStore((s) => s.layoutMode);
  const setLayoutMode = useBoardStore((s) => s.setLayoutMode);
  const showToast = useBoardStore((s) => s.showToast);

  const scale = useViewportStore((s) => s.scale);
  const zoomAt = useViewportStore((s) => s.zoomAt);
  const resetView = useViewportStore((s) => s.resetView);

  const [togglingLayout, setTogglingLayout] = useState(false);

  function stepZoom(delta: number) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((scale + delta) * 100) / 100));
    zoomAt(next, window.innerWidth / 2, window.innerHeight / 2);
  }

  async function handleToggleLayout() {
    if (togglingLayout) return;
    const prevMode: LayoutMode = layoutMode;
    const nextMode: LayoutMode = prevMode === "free" ? "organized" : "free";

    setTogglingLayout(true);
    setLayoutMode(nextMode);
    if (nextMode === "organized") {
      // 切入智能整理时自动归位视角，便于直接总览三列
      resetView();
    }

    const res = await emitWithAck<BoardLayoutDTO>(SOCKET_EVENTS.BOARD_LAYOUT, {
      mode: nextMode,
    });
    setTogglingLayout(false);

    if (!res.ok) {
      setLayoutMode(prevMode);
      showToast(res.message);
      return;
    }
    setLayoutMode(res.data.mode, res.data.updatedAt);
  }

  const isOrganized = layoutMode === "organized";

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 select-none">
      {/* 底部核心三模式 + 智能整理悬浮药丸 */}
      <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-[0_8px_28px_rgba(15,23,42,0.08)] rounded-full px-2 py-1.5">
        {TOOLS.map((t) => {
          const active = toolMode === t.mode;
          const disabled = t.mode === "drag" && isOrganized;
          return (
            <button
              key={t.mode}
              type="button"
              title={disabled ? "智能整理模式下不支持拖动卡片，关闭整理后可恢复自由拖动" : t.tip}
              onClick={() => {
                if (disabled) {
                  showToast("智能整理模式下不支持拖动，切回自由画布后即可拖动");
                  return;
                }
                setToolMode(t.mode);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                disabled
                  ? "text-slate-300 cursor-not-allowed"
                  : active
                    ? "bg-slate-900 text-white shadow-xs cursor-pointer"
                    : "text-slate-600 hover:bg-slate-100 cursor-pointer"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* 智能整理全局切换按钮（无损保留每张卡片的自由坐标） */}
        <button
          type="button"
          disabled={togglingLayout}
          onClick={() => void handleToggleLayout()}
          title={
            isOrganized
              ? "点击切回自由散落墙面（无损恢复原位置，全员同步）"
              : "按正向/中性/负面自动分列整理（不覆盖原坐标，全员同步）"
          }
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer disabled:opacity-60 ${
            isOrganized
              ? "bg-slate-900 text-white shadow-xs hover:bg-slate-800"
              : "bg-slate-900/90 text-white hover:bg-slate-900"
          }`}
        >
          <span>✨</span>
          <span>{isOrganized ? "恢复自由墙" : "智能整理"}</span>
        </button>
      </div>

      {/* 视口缩放控制条 */}
      <div className="flex items-center bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-[0_8px_24px_rgba(15,23,42,0.06)] rounded-full px-1.5 py-1 text-xs text-slate-600">
        <button
          type="button"
          onClick={() => stepZoom(-0.15)}
          title="缩小"
          className="w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetView}
          title="点击重置画布视角"
          className="px-2 py-0.5 rounded-full hover:bg-slate-100 font-medium cursor-pointer"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => stepZoom(0.15)}
          title="放大"
          className="w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
}
