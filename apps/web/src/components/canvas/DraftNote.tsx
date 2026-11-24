import { useState, type KeyboardEvent } from "react";
import { SOCKET_EVENTS, type CommentDTO } from "@wall/shared";
import { emitWithAck } from "../../lib/socket";
import { useBoardStore } from "../../stores/useBoardStore";

interface DraftNoteProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function DraftNote({ x, y, onClose }: DraftNoteProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const upsertComment = useBoardStore((s) => s.upsertComment);
  const showToast = useBoardStore((s) => s.showToast);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const res = await emitWithAck<CommentDTO>(SOCKET_EVENTS.COMMENT_CREATE, {
      content: trimmed,
      x,
      y,
    });
    setSubmitting(false);

    if (!res.ok) {
      showToast(res.message);
      return;
    }
    upsertComment(res.data);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div
      data-note="true"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        zIndex: 9999,
      }}
      className="absolute top-0 left-0 w-[264px] rounded-2xl bg-white shadow-xl border-2 border-slate-900/20 p-4 flex flex-col gap-3"
    >
      <textarea
        autoFocus
        rows={4}
        maxLength={500}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="写下你的建议或想法...（Ctrl+Enter 发布）"
        className="w-full resize-none text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none leading-relaxed bg-transparent"
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{content.trim().length}/500</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-100 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!content.trim() || submitting}
            onClick={() => void handleSubmit()}
            className="px-3 py-1 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
          >
            {submitting ? "发布中" : "发布"}
          </button>
        </div>
      </div>
    </div>
  );
}
