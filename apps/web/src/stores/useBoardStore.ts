import { create } from "zustand";
import type {
  BoardSnapshotDTO,
  CommentDTO,
  CommentDraggingDTO,
  CommentSentimentDTO,
  LayoutMode,
  ToolMode,
  UserDTO,
} from "@wall/shared";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

interface BoardState {
  comments: Map<string, CommentDTO>;
  draggingMap: Map<string, CommentDraggingDTO>;
  onlineUsers: UserDTO[];
  layoutMode: LayoutMode;
  toolMode: ToolMode;
  connectionStatus: ConnectionStatus;
  connected: boolean;
  updatedAt: string | null;
  toast: string | null;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setToolMode: (mode: ToolMode) => void;
  showToast: (message: string) => void;
  clearToast: () => void;

  applySnapshot: (snapshot: BoardSnapshotDTO) => void;
  setOnlineUsers: (users: UserDTO[]) => void;
  upsertComment: (comment: CommentDTO, trustLikedByMe?: boolean) => void;
  applySentiment: (payload: CommentSentimentDTO) => void;
  setLayoutMode: (mode: LayoutMode, updatedAt?: string) => void;
  optimisticUpdateComment: (id: string, patch: Partial<CommentDTO>) => CommentDTO | undefined;
  restoreComment: (comment: CommentDTO) => void;
  removeComment: (id: string) => void;
  setDragging: (payload: CommentDraggingDTO) => void;
  clearDragging: (id: string) => void;
  reset: () => void;
}

const DRAG_STALE_MS = 2500;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const dragTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearDragTimer(id: string) {
  const t = dragTimers.get(id);
  if (t) {
    clearTimeout(t);
    dragTimers.delete(id);
  }
}

function clearAllDragTimers() {
  for (const t of dragTimers.values()) clearTimeout(t);
  dragTimers.clear();
}

export const useBoardStore = create<BoardState>((set, get) => ({
  comments: new Map(),
  draggingMap: new Map(),
  onlineUsers: [],
  layoutMode: "free",
  toolMode: "create",
  connectionStatus: "connecting",
  connected: false,
  updatedAt: null,
  toast: null,

  setConnectionStatus(connectionStatus) {
    set({ connectionStatus, connected: connectionStatus === "connected" });
  },

  setToolMode(toolMode) {
    set({ toolMode });
  },

  showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => {
      set({ toast: null });
      toastTimer = null;
    }, 2600);
  },

  clearToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    set({ toast: null });
  },

  applySnapshot(snapshot) {
    clearAllDragTimers();
    const next = new Map<string, CommentDTO>();
    for (const c of snapshot.comments) {
      next.set(c.id, c);
    }
    set({
      comments: next,
      draggingMap: new Map(),
      onlineUsers: snapshot.onlineUsers,
      layoutMode: snapshot.layoutMode,
      updatedAt: snapshot.updatedAt,
    });
  },

  setOnlineUsers(onlineUsers) {
    set({ onlineUsers });
  },

  upsertComment(incoming, trustLikedByMe = false) {
    set((s) => {
      const existing = s.comments.get(incoming.id);
      // 丢弃版本号低于本地的过期事件，防止网络乱序导致位置或点赞数回跳
      if (existing && incoming.version < existing.version) {
        return s;
      }
      clearDragTimer(incoming.id);
      const nextComments = new Map(s.comments);
      // 他人广播事件不含当前用户的 likedByMe 视角，合并时保留本地点赞标记；
      // 本人点赞 ack 返回时传 trustLikedByMe=true 以权威值覆盖。
      nextComments.set(incoming.id, {
        ...incoming,
        likedByMe: trustLikedByMe
          ? incoming.likedByMe
          : (existing?.likedByMe ?? incoming.likedByMe),
      });
      const nextDragging = new Map(s.draggingMap);
      nextDragging.delete(incoming.id);
      return {
        comments: nextComments,
        draggingMap: nextDragging,
        updatedAt: incoming.updatedAt,
      };
    });
  },

  applySentiment(payload) {
    set((s) => {
      const existing = s.comments.get(payload.id);
      if (!existing || payload.version < existing.version) return s;
      const nextComments = new Map(s.comments);
      nextComments.set(payload.id, {
        ...existing,
        sentiment: payload.sentiment,
        version: payload.version,
        updatedAt: payload.updatedAt,
      });
      return {
        comments: nextComments,
        updatedAt: payload.updatedAt,
      };
    });
  },

  setLayoutMode(layoutMode, updatedAt) {
    set((s) => {
      if (layoutMode === "organized") {
        clearAllDragTimers();
      }
      return {
        layoutMode,
        // 整理模式下禁用拖动，若当前正处于拖动工具则自动切回新增模式
        toolMode: layoutMode === "organized" && s.toolMode === "drag" ? "create" : s.toolMode,
        draggingMap: layoutMode === "organized" ? new Map() : s.draggingMap,
        updatedAt: updatedAt ?? s.updatedAt,
      };
    });
  },

  optimisticUpdateComment(id, patch) {
    const prev = get().comments.get(id);
    if (!prev) return undefined;
    set((s) => {
      const next = new Map(s.comments);
      next.set(id, { ...prev, ...patch });
      return { comments: next };
    });
    return prev;
  },

  restoreComment(comment) {
    set((s) => {
      const next = new Map(s.comments);
      next.set(comment.id, comment);
      return { comments: next };
    });
  },

  removeComment(id) {
    clearDragTimer(id);
    set((s) => {
      if (!s.comments.has(id)) return s;
      const nextComments = new Map(s.comments);
      nextComments.delete(id);
      const nextDragging = new Map(s.draggingMap);
      nextDragging.delete(id);
      return {
        comments: nextComments,
        draggingMap: nextDragging,
        updatedAt: new Date().toISOString(),
      };
    });
  },

  setDragging(payload) {
    clearDragTimer(payload.id);
    // 对方拖动中途若突然断线，超过阈值未收到新帧时自动清除高亮，避免界面卡死
    dragTimers.set(
      payload.id,
      setTimeout(() => {
        dragTimers.delete(payload.id);
        get().clearDragging(payload.id);
      }, DRAG_STALE_MS),
    );
    set((s) => {
      const next = new Map(s.draggingMap);
      next.set(payload.id, payload);
      return { draggingMap: next };
    });
  },

  clearDragging(id) {
    clearDragTimer(id);
    set((s) => {
      if (!s.draggingMap.has(id)) return s;
      const next = new Map(s.draggingMap);
      next.delete(id);
      return { draggingMap: next };
    });
  },

  reset() {
    clearAllDragTimers();
    set({
      comments: new Map(),
      draggingMap: new Map(),
      onlineUsers: [],
      layoutMode: "free",
      connectionStatus: "connecting",
      connected: false,
      updatedAt: null,
    });
  },
}));
