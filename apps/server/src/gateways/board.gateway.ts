import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import {
  ERROR_CODES,
  SOCKET_EVENTS,
  boardLayoutSchema,
  createCommentSchema,
  deleteCommentSchema,
  dragCommentSchema,
  likeCommentSchema,
  moveCommentSchema,
  updateCommentSchema,
  type AckResult,
  type UserDTO,
} from "@wall/shared";
import { AppError } from "../lib/errors.js";
import { TokenBucket } from "../lib/rate-limit.js";
import { sentimentService } from "../sentiment/sentiment.service.js";
import { authService } from "../services/auth.service.js";
import { commentService } from "../services/comment.service.js";
import { presenceService } from "../services/presence.service.js";

interface AuthedSocketData {
  userId: string;
  user: UserDTO;
}

type AckFn<T = unknown> = (res: AckResult<T>) => void;

// 统一将 Socket 事件处理中的校验、限流与异常转换为结构化 ack，防止单次异常击穿进程
function wrapAck<T>(
  app: FastifyInstance,
  ack: unknown,
  handler: () => Promise<T>,
) {
  const respond: AckFn<T> = typeof ack === "function" ? (ack as AckFn<T>) : () => {};
  handler()
    .then((data) => respond({ ok: true, data }))
    .catch((err: unknown) => {
      if (err instanceof AppError) {
        respond({ ok: false, code: err.code, message: err.message });
        return;
      }
      app.log.error(err, "Socket 事件处理异常");
      respond({ ok: false, code: ERROR_CODES.INTERNAL, message: "服务器内部错误" });
    });
}

export function setupBoardGateway(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: { origin: true, credentials: true },
  });

  // 情绪异步分析完成后，向全体在线客户端推送变色事件
  sentimentService.setBroadcaster((payload) => {
    io.emit(SOCKET_EVENTS.COMMENT_SENTIMENT, payload);
  });

  // 握手鉴权中间件：从 auth.token 验证 JWT，绝不采信客户端提交的 authorId
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) {
        return next(new Error(ERROR_CODES.UNAUTHORIZED));
      }
      const payload = app.jwt.verify<{ sub: string }>(token);
      const user = await authService.getById(payload.sub);
      (socket.data as AuthedSocketData).userId = user.id;
      (socket.data as AuthedSocketData).user = user;
      next();
    } catch {
      next(new Error(ERROR_CODES.UNAUTHORIZED));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const { userId, user } = socket.data as AuthedSocketData;
    // 每个连接独立的令牌桶：区分写库操作与高频拖拽帧
    const writeBucket = new TokenBucket(20, 5);
    const dragBucket = new TokenBucket(60, 45);

    const becameOnline = presenceService.join(socket.id, user);
    if (becameOnline) {
      socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_UPDATE, presenceService.getOnlineUsers());
    }

    // 连接与重连均推送全量快照，保证客户端状态权威对账
    try {
      const snapshot = await commentService.getSnapshot(userId, presenceService.getOnlineUsers());
      socket.emit(SOCKET_EVENTS.BOARD_SNAPSHOT, snapshot);
    } catch (err) {
      app.log.error(err, "下发画板快照失败");
    }

    socket.on(SOCKET_EVENTS.COMMENT_CREATE, (raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!writeBucket.consume()) throw AppError.rateLimited();
        const parsed = createCommentSchema.safeParse(raw);
        if (!parsed.success) {
          throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
        }
        const comment = await commentService.create(userId, parsed.data);
        socket.broadcast.emit(SOCKET_EVENTS.COMMENT_UPSERTED, comment);
        return comment;
      });
    });

    socket.on(SOCKET_EVENTS.COMMENT_UPDATE, (raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!writeBucket.consume()) throw AppError.rateLimited();
        const parsed = updateCommentSchema.safeParse(raw);
        if (!parsed.success) {
          throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
        }
        const comment = await commentService.updateContent(userId, parsed.data);
        socket.broadcast.emit(SOCKET_EVENTS.COMMENT_UPSERTED, comment);
        return comment;
      });
    });

    // 拖拽中间帧：仅内存广播不落库，降低数据库写放大
    socket.on(SOCKET_EVENTS.COMMENT_DRAG, (raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!dragBucket.consume()) throw AppError.rateLimited();
        const parsed = dragCommentSchema.safeParse(raw);
        if (!parsed.success) {
          throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
        }
        await commentService.verifyDragOwnership(userId, parsed.data.id);
        socket.broadcast.emit(SOCKET_EVENTS.COMMENT_DRAGGING, {
          id: parsed.data.id,
          x: parsed.data.x,
          y: parsed.data.y,
          byUserId: userId,
          byNickname: user.nickname,
        });
      });
    });

    socket.on(SOCKET_EVENTS.COMMENT_MOVE, (raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!writeBucket.consume()) throw AppError.rateLimited();
        const parsed = moveCommentSchema.safeParse(raw);
        if (!parsed.success) {
          throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
        }
        const comment = await commentService.move(userId, parsed.data);
        socket.broadcast.emit(SOCKET_EVENTS.COMMENT_UPSERTED, comment);
        return comment;
      });
    });

    socket.on(SOCKET_EVENTS.COMMENT_DELETE, (raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!writeBucket.consume()) throw AppError.rateLimited();
        const parsed = deleteCommentSchema.safeParse(raw);
        if (!parsed.success) {
          throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
        }
        await commentService.remove(userId, parsed.data.id);
        socket.broadcast.emit(SOCKET_EVENTS.COMMENT_REMOVED, { id: parsed.data.id });
        return { id: parsed.data.id };
      });
    });

    socket.on(SOCKET_EVENTS.COMMENT_LIKE, (raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!writeBucket.consume()) throw AppError.rateLimited();
        const parsed = likeCommentSchema.safeParse(raw);
        if (!parsed.success) {
          throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
        }
        const comment = await commentService.toggleLike(userId, parsed.data.id);
        // 广播给他人时不透传当前操作者的 likedByMe，避免覆盖他人本地点赞状态
        socket.broadcast.emit(SOCKET_EVENTS.COMMENT_UPSERTED, {
          ...comment,
          likedByMe: false,
        });
        return comment;
      });
    });

    // 主动快照对账：客户端遇到版本冲突或弱网恢复时可触发全量拉齐
    socket.on(SOCKET_EVENTS.BOARD_SYNC, (_raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!writeBucket.consume()) throw AppError.rateLimited();
        return commentService.getSnapshot(userId, presenceService.getOnlineUsers());
      });
    });

    // 智能整理全局模式切换：任何登录用户均可切换，全员实时同步
    socket.on(SOCKET_EVENTS.BOARD_LAYOUT, (raw: unknown, ack?: unknown) => {
      wrapAck(app, ack, async () => {
        if (!writeBucket.consume()) throw AppError.rateLimited();
        const parsed = boardLayoutSchema.safeParse(raw);
        if (!parsed.success) {
          throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
        }
        const next = await commentService.setLayoutMode(parsed.data.mode);
        socket.broadcast.emit(SOCKET_EVENTS.BOARD_LAYOUT, next);
        return next;
      });
    });

    socket.on("disconnect", () => {
      const becameOffline = presenceService.leave(socket.id);
      if (becameOffline) {
        io.emit(SOCKET_EVENTS.PRESENCE_UPDATE, presenceService.getOnlineUsers());
      }
    });
  });

  // 随 Fastify 优雅停机一并关闭 Socket.IO
  app.addHook("onClose", async () => {
    await io.close();
  });

  return io;
}
