import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { organizeComments } from "@wall/shared";
import { requestBoardSync } from "../../lib/socket";
import { useAuthStore } from "../../stores/useAuthStore";
import { useBoardStore } from "../../stores/useBoardStore";
import { screenToWorld, useViewportStore } from "../../stores/useViewportStore";
import { DraftNote } from "./DraftNote";
import { MoodBar } from "./MoodBar";
import { StickyNote } from "./StickyNote";

function formatHeaderTime(iso: string | null): string {
  if (!iso) return "等待同步...";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} 已更新`;
}

const ORGANIZED_HEADERS = [
  { x: 120, label: "正向反馈", dot: "bg-emerald-400" },
  { x: 436, label: "中性建议", dot: "bg-slate-400" },
  { x: 752, label: "负面吐槽", dot: "bg-rose-400" },
];

// 独立卡片层：不订阅 useViewportStore，确保画布平移和缩放时不触发卡片列表重渲染
const NoteLayer = memo(function NoteLayer() {
  const comments = useBoardStore((s) => s.comments);
  const draggingMap = useBoardStore((s) => s.draggingMap);
  const layoutMode = useBoardStore((s) => s.layoutMode);
  const toolMode = useBoardStore((s) => s.toolMode);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const commentList = useMemo(() => Array.from(comments.values()), [comments]);
  const organizedMap = useMemo(
    () => (layoutMode === "organized" ? organizeComments(commentList) : null),
    [layoutMode, commentList],
  );

  return (
    <>
      {layoutMode === "organized" &&
        ORGANIZED_HEADERS.map((h) => (
          <div
            key={h.label}
            style={{ transform: `translate3d(${h.x}px, 92px, 0)` }}
            className="pointer-events-none absolute top-0 left-0 w-[268px] flex items-center gap-2 text-xs font-medium text-slate-500 select-none"
          >
            <span className={`w-2 h-2 rounded-full ${h.dot}`} />
            <span>{h.label}</span>
          </div>
        ))}

      {commentList.map((comment) => (
        <StickyNote
          key={comment.id}
          comment={comment}
          dragging={draggingMap.get(comment.id)}
          organizedPos={organizedMap?.get(comment.id)}
          isMine={comment.authorId === currentUserId}
          toolMode={toolMode}
        />
      ))}
    </>
  );
});

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetX = useViewportStore((s) => s.offsetX);
  const offsetY = useViewportStore((s) => s.offsetY);
  const scale = useViewportStore((s) => s.scale);
  const panBy = useViewportStore((s) => s.panBy);
  const zoomAt = useViewportStore((s) => s.zoomAt);

  const commentCount = useBoardStore((s) => s.comments.size);
  const updatedAt = useBoardStore((s) => s.updatedAt);
  const toolMode = useBoardStore((s) => s.toolMode);
  const connectionStatus = useBoardStore((s) => s.connectionStatus);
  const showToast = useBoardStore((s) => s.showToast);

  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [panning, setPanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const currentScale = useViewportStore.getState().scale;
    zoomAt(currentScale * factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    const shouldPan = e.button === 1 || (e.button === 0 && spacePressed);
    if (!shouldPan) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    setPanning(true);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    panBy(e.clientX - pan.lastX, e.clientY - pan.lastY);
    pan.lastX = e.clientX;
    pan.lastY = e.clientY;
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    panRef.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleCanvasClick(e: MouseEvent<HTMLDivElement>) {
    if (spacePressed || panning || toolMode !== "create") return;
    if ((e.target as HTMLElement).closest("[data-note='true']")) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const world = screenToWorld(
      e.clientX - rect.left,
      e.clientY - rect.top,
      useViewportStore.getState(),
    );
    setDraftPos({ x: Math.round(world.x - 134), y: Math.round(world.y - 24) });
  }

  async function handleManualSync() {
    if (syncing) return;
    setSyncing(true);
    const ok = await requestBoardSync();
    setSyncing(false);
    showToast(ok ? "已与服务端完成最新状态对账" : "同步失败，请检查网络连接");
  }

  const canvasCursor = panning
    ? "cursor-grabbing"
    : spacePressed
      ? "cursor-grab"
      : toolMode === "create"
        ? "cursor-crosshair"
        : "cursor-default";

  return (
    <main
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleCanvasClick}
      className={`relative flex-1 h-full overflow-hidden bg-[#fafafa] ${canvasCursor}`}
      style={{
        backgroundImage: "radial-gradient(#e5e7eb 1px, transparent 1px)",
        backgroundSize: `${Math.round(24 * scale)}px ${Math.round(24 * scale)}px`,
        backgroundPosition: `${offsetX}px ${offsetY}px`,
      }}
    >
      {/* 顶部信息栏：情绪概览条 + 共反馈条数 + 右上角云同步时间 */}
      <header className="pointer-events-none absolute top-3.5 inset-x-6 z-20 flex items-start justify-between gap-4">
        <div className="w-44 pt-1 text-[11px] text-slate-400">
          滚轮缩放 · 空格+拖拽平移
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <MoodBar />
          <div className="text-xs text-slate-500 font-normal">
            共反馈 <span className="text-slate-900 font-semibold mx-0.5">{commentCount}</span> 条建议
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleManualSync();
          }}
          title="点击立即与服务端全量对账"
          className="pointer-events-auto w-44 pt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 transition cursor-pointer"
        >
          <svg
            className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-slate-600" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 18a4.5 4.5 0 0 1-.8-8.93A6 6 0 0 1 17.8 8.2 3.8 3.8 0 0 1 18.5 18H7Z"
            />
          </svg>
          <span>{formatHeaderTime(updatedAt)}</span>
        </button>
      </header>

      {/* 断线重连温和状态提示条 */}
      {connectionStatus === "reconnecting" && (
        <div className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium shadow-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          网络连接中断，正在自动重连并同步画板...
        </div>
      )}

      {/* 世界坐标变换层 */}
      <div
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{
          transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`,
        }}
      >
        <NoteLayer />
        {draftPos && (
          <DraftNote
            x={draftPos.x}
            y={draftPos.y}
            onClose={() => setDraftPos(null)}
          />
        )}
      </div>
    </main>
  );
}
