import { io, type Socket } from "socket.io-client";
import {
  ERROR_CODES,
  SOCKET_EVENTS,
  type AckResult,
  type BoardLayoutDTO,
  type BoardSnapshotDTO,
  type CommentDTO,
  type CommentDraggingDTO,
  type CommentRemovedDTO,
  type CommentSentimentDTO,
  type UserDTO,
} from "@wall/shared";
import { useAuthStore } from "../stores/useAuthStore";
import { useBoardStore } from "../stores/useBoardStore";

let socket: Socket | null = null;
let hadDisconnected = false;

export function connectSocket(token: string) {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  hadDisconnected = false;
  useBoardStore.getState().setConnectionStatus("connecting");

  const client = io({
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  client.on("connect", () => {
    useBoardStore.getState().setConnectionStatus("connected");
    if (hadDisconnected) {
      hadDisconnected = false;
      useBoardStore.getState().showToast("连接已恢复，画板已同步");
    }
  });

  client.on("disconnect", (reason) => {
    // 主动退出登录不算异常断线
    if (reason !== "io client disconnect") {
      hadDisconnected = true;
      useBoardStore.getState().setConnectionStatus("reconnecting");
    }
  });

  client.io.on("reconnect_attempt", () => {
    useBoardStore.getState().setConnectionStatus("reconnecting");
  });

  client.on("connect_error", (err) => {
    useBoardStore.getState().setConnectionStatus("reconnecting");
    // 鉴权失败时退出登录，避免无效 token 无限重连
    if (err.message === ERROR_CODES.UNAUTHORIZED) {
      useAuthStore.getState().logout();
    }
  });

  client.on(SOCKET_EVENTS.BOARD_SNAPSHOT, (snapshot: BoardSnapshotDTO) => {
    useBoardStore.getState().applySnapshot(snapshot);
  });

  client.on(SOCKET_EVENTS.PRESENCE_UPDATE, (users: UserDTO[]) => {
    useBoardStore.getState().setOnlineUsers(users);
  });

  client.on(SOCKET_EVENTS.COMMENT_UPSERTED, (comment: CommentDTO) => {
    useBoardStore.getState().upsertComment(comment, false);
  });

  client.on(SOCKET_EVENTS.COMMENT_REMOVED, ({ id }: CommentRemovedDTO) => {
    useBoardStore.getState().removeComment(id);
  });

  client.on(SOCKET_EVENTS.COMMENT_DRAGGING, (payload: CommentDraggingDTO) => {
    useBoardStore.getState().setDragging(payload);
  });

  client.on(SOCKET_EVENTS.COMMENT_SENTIMENT, (payload: CommentSentimentDTO) => {
    useBoardStore.getState().applySentiment(payload);
  });

  client.on(SOCKET_EVENTS.BOARD_LAYOUT, (payload: BoardLayoutDTO) => {
    useBoardStore.getState().setLayoutMode(payload.mode, payload.updatedAt);
  });

  socket = client;
  return client;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  hadDisconnected = false;
  useBoardStore.getState().reset();
}

export function emitWithAck<T>(event: string, payload: unknown): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({
        ok: false,
        code: ERROR_CODES.INTERNAL,
        message: "连接已断开，正在重连...",
      });
      return;
    }
    socket.timeout(5000).emit(event, payload, (err: Error | null, res?: AckResult<T>) => {
      if (err) {
        resolve({ ok: false, code: ERROR_CODES.INTERNAL, message: "请求超时，请重试" });
        return;
      }
      resolve(
        res ?? { ok: false, code: ERROR_CODES.INTERNAL, message: "未收到服务端确认" },
      );
    });
  });
}

// 主动拉取全量快照对账（用于版本冲突自动自愈或手动刷新同步）
export async function requestBoardSync(): Promise<boolean> {
  const res = await emitWithAck<BoardSnapshotDTO>(SOCKET_EVENTS.BOARD_SYNC, {});
  if (!res.ok) return false;
  useBoardStore.getState().applySnapshot(res.data);
  return true;
}

export function emitDragFrame(payload: { id: string; x: number; y: number }) {
  if (!socket || !socket.connected) return;
  socket.emit(SOCKET_EVENTS.COMMENT_DRAG, payload);
}
