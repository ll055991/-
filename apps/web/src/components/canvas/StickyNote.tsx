import { memo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  ERROR_CODES,
  SOCKET_EVENTS,
  type CommentDTO,
  type CommentDraggingDTO,
  type ToolMode,
} from "@wall/shared";
import { emitDragFrame, emitWithAck, requestBoardSync } from "../../lib/socket";
import { useBoardStore } from "../../stores/useBoardStore";
import { useViewportStore } from "../../stores/useViewportStore";

interface StickyNoteProps {
  comment: CommentDTO;
  dragging?: CommentDraggingDTO;
  organizedPos?: { x: number; y: number; rotation: number };
  isMine: boolean;
  toolMode: ToolMode;
}

const DRAG_THROTTLE_MS = 40;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 贴纸柔和粉彩底色：还原原型图轻盈质感，并预留 M4 情绪自动变色映射
function getSentimentSurface(sentiment: CommentDTO["sentiment"]): string {
  switch (sentiment) {
    case "POSITIVE":
      return "bg-[#e3f7eb] border-emerald-200/60";
    case "NEGATIVE":
      return "bg-[#fde8ea] border-rose-200/60";
    case "NEUTRAL":
    case "PENDING":
    default:
      return "bg-[#f2f3f7] border-slate-200/60";
  }
}

export const StickyNote = memo(function StickyNote({
  comment,
  dragging,
  organizedPos,
  isMine,
  toolMode,
}: StickyNoteProps) {
  const upsertComment = useBoardStore((s) => s.upsertComment);
  const optimisticUpdateComment = useBoardStore((s) => s.optimisticUpdateComment);
  const restoreComment = useBoardStore((s) => s.restoreComment);
  const removeComment = useBoardStore((s) => s.removeComment);
  const showToast = useBoardStore((s) => s.showToast);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [heartPop, setHeartPop] = useState(false);
  const likingRef = useRef(false);

  const [localPos, setLocalPos] = useState<{ x: number; y: number } | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    lastEmitAt: number;
    moved: boolean;
  } | null>(null);

  const isOrganized = Boolean(organizedPos);
  const displayX = organizedPos?.x ?? localPos?.x ?? dragging?.x ?? comment.x;
  const displayY = organizedPos?.y ?? localPos?.y ?? dragging?.y ?? comment.y;
  const displayRotation = organizedPos ? organizedPos.rotation : comment.rotation;
  const isLocallyDragging = !isOrganized && localPos !== null;
  const isRemotelyDragging = !isOrganized && !isLocallyDragging && Boolean(dragging);

  function startEdit() {
    if (!isMine) {
      showToast("只能编辑自己的评论卡片");
      return;
    }
    setEditText(comment.content);
    setEditing(true);
  }

  async function commitEdit() {
    const trimmed = editText.trim();
    if (!trimmed) {
      showToast("评论内容不能为空");
      return;
    }
    if (trimmed === comment.content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const prev = optimisticUpdateComment(comment.id, { content: trimmed });
    const res = await emitWithAck<CommentDTO>(SOCKET_EVENTS.COMMENT_UPDATE, {
      id: comment.id,
      content: trimmed,
      version: comment.version,
    });
    setSaving(false);

    if (!res.ok) {
      if (prev) restoreComment(prev);
      showToast(res.message);
      if (res.code === ERROR_CODES.CONFLICT) {
        void requestBoardSync();
      }
      return;
    }
    upsertComment(res.data);
    setEditing(false);
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setEditing(false);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void commitEdit();
    }
  }

  async function handleDelete() {
    if (!isMine) return;
    const prev = comment;
    removeComment(comment.id);
    const res = await emitWithAck<{ id: string }>(SOCKET_EVENTS.COMMENT_DELETE, {
      id: comment.id,
    });
    if (!res.ok) {
      restoreComment(prev);
      showToast(res.message);
    }
  }

  async function handleToggleLike() {
    if (isMine) {
      showToast("不能给自己的评论点赞");
      return;
    }
    if (likingRef.current) return;
    likingRef.current = true;

    const nextLiked = !comment.likedByMe;
    const nextCount = Math.max(0, comment.likeCount + (nextLiked ? 1 : -1));
    if (nextLiked) {
      setHeartPop(true);
      setTimeout(() => setHeartPop(false), 260);
    }

    const prev = optimisticUpdateComment(comment.id, {
      likedByMe: nextLiked,
      likeCount: nextCount,
    });
    const res = await emitWithAck<CommentDTO>(SOCKET_EVENTS.COMMENT_LIKE, {
      id: comment.id,
    });
    likingRef.current = false;

    if (!res.ok) {
      if (prev) restoreComment(prev);
      showToast(res.message);
      if (res.code === ERROR_CODES.CONFLICT) {
        void requestBoardSync();
      }
      return;
    }
    upsertComment(res.data, true);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || editing) return;
    if (toolMode === "like") {
      e.stopPropagation();
      void handleToggleLike();
      return;
    }
    if (toolMode !== "drag") return;

    e.stopPropagation();
    if (isOrganized) {
      showToast("智能整理模式下不支持拖动卡片，请先恢复自由墙");
      return;
    }
    if (!isMine) {
      showToast("只能拖动自己的评论卡片");
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: comment.x,
      originY: comment.y,
      lastEmitAt: 0,
      moved: false,
    };
    setLocalPos({ x: comment.x, y: comment.y });
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const scale = useViewportStore.getState().scale;
    const dx = (e.clientX - session.startClientX) / scale;
    const dy = (e.clientY - session.startClientY) / scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      session.moved = true;
    }
    const nextX = Math.round((session.originX + dx) * 10) / 10;
    const nextY = Math.round((session.originY + dy) * 10) / 10;
    setLocalPos({ x: nextX, y: nextY });

    const now = performance.now();
    if (now - session.lastEmitAt >= DRAG_THROTTLE_MS) {
      session.lastEmitAt = now;
      emitDragFrame({ id: comment.id, x: nextX, y: nextY });
    }
  }

  async function finishDrag(e: PointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    dragSessionRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const finalPos = localPos;
    setLocalPos(null);
    if (!finalPos || !session.moved) return;

    const prev = optimisticUpdateComment(comment.id, {
      x: finalPos.x,
      y: finalPos.y,
    });
    const res = await emitWithAck<CommentDTO>(SOCKET_EVENTS.COMMENT_MOVE, {
      id: comment.id,
      x: finalPos.x,
      y: finalPos.y,
      version: comment.version,
    });
    if (!res.ok) {
      if (prev) restoreComment(prev);
      showToast(res.message);
      if (res.code === ERROR_CODES.CONFLICT) {
        void requestBoardSync();
      }
      return;
    }
    upsertComment(res.data);
  }

  const cursorClass = editing
    ? "cursor-text"
    : toolMode === "drag"
      ? isMine
        ? isLocallyDragging
          ? "cursor-grabbing"
          : "cursor-grab"
        : "cursor-not-allowed"
      : toolMode === "like"
        ? isMine
          ? "cursor-not-allowed"
          : "cursor-pointer hover:ring-2 hover:ring-rose-300/80"
        : "cursor-default";

  return (
    <div
      data-note="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => void finishDrag(e)}
      onPointerCancel={(e) => void finishDrag(e)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        transform: `translate3d(${displayX}px, ${displayY}px, 0) rotate(${displayRotation}deg)`,
        zIndex: isLocallyDragging || isRemotelyDragging ? 9000 : comment.zIndex,
      }}
      className={`group absolute top-0 left-0 w-[268px] rounded-2xl border p-4 shadow-[0_6px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_10px_28px_rgba(15,23,42,0.10)] select-none ${getSentimentSurface(
        comment.sentiment,
      )} ${cursorClass} ${
        isLocallyDragging
          ? "shadow-xl ring-2 ring-slate-900/20"
          : isRemotelyDragging
            ? "transition-transform duration-75 ring-2 ring-sky-400/70 shadow-lg"
            : "transition-[transform,box-shadow,background-color,border-color] duration-500 ease-out"
      }`}
    >
      {isRemotelyDragging && dragging && (
        <div className="absolute -top-6 left-2 px-2 py-0.5 rounded-full bg-sky-500 text-white text-[11px] font-medium shadow-sm whitespace-nowrap">
          {dragging.byNickname} 正在拖动
        </div>
      )}

      {isMine && !editing && (
        <div className="absolute top-2.5 right-2.5 hidden group-hover:flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              startEdit();
            }}
            className="px-1.5 py-0.5 rounded-md bg-white/85 hover:bg-white text-[11px] text-slate-600 shadow-xs cursor-pointer"
          >
            编辑
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete();
            }}
            className="px-1.5 py-0.5 rounded-md bg-white/85 hover:bg-rose-50 text-[11px] text-rose-500 shadow-xs cursor-pointer"
          >
            删除
          </button>
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            rows={4}
            maxLength={500}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="w-full resize-none rounded-lg bg-white/90 p-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/15 leading-relaxed"
          />
          <div className="flex items-center justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-2 py-1 rounded-md text-slate-500 hover:bg-black/5 cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving || !editText.trim()}
              onClick={() => void commitEdit()}
              className="px-2.5 py-1 rounded-md bg-slate-900 text-white font-medium disabled:opacity-40 cursor-pointer"
            >
              {saving ? "保存中" : "保存"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] leading-[1.65] text-[#2d3340] whitespace-pre-wrap break-words min-h-[58px]">
          {comment.content}
        </p>
      )}

      {/* 贴纸底部信息：左侧头像/作者/时间，右侧珊瑚红爱心点赞 */}
      <div className="mt-3.5 pt-2.5 border-t border-black/[0.04] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shrink-0 shadow-xs"
            style={{ backgroundColor: comment.author.avatarColor }}
          >
            {comment.author.nickname.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-[12px] font-medium text-slate-700 truncate">
              {comment.author.nickname}
              {isMine && <span className="ml-1 text-[10px] text-slate-400">我</span>}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>{formatTime(comment.createdAt)}</span>
              {comment.sentiment === "PENDING" && (
                <span className="inline-flex items-center gap-0.5 text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                  分析中
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void handleToggleLike();
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition ${
            isMine
              ? "text-slate-300 cursor-not-allowed"
              : comment.likedByMe
                ? "text-[#ff4d6d] hover:bg-rose-500/10 cursor-pointer"
                : "text-slate-400 hover:text-[#ff4d6d] hover:bg-rose-500/10 cursor-pointer"
          }`}
          title={
            isMine
              ? "不能给自己的评论点赞"
              : comment.likedByMe
                ? "取消点赞"
                : "点赞这条建议"
          }
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              heartPop ? "scale-135" : "scale-100"
            }`}
            viewBox="0 0 24 24"
            fill={comment.likedByMe ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          </svg>
          {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
        </button>
      </div>
    </div>
  );
});
