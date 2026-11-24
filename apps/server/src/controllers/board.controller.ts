import type { FastifyInstance } from "fastify";
import { commentService } from "../services/comment.service.js";
import { presenceService } from "../services/presence.service.js";

export async function boardController(app: FastifyInstance) {
  // 提供 REST 快照接口，与 Socket.IO 共用同一套 Service 逻辑
  app.get("/api/board/snapshot", { preHandler: app.authenticate }, async (req) => {
    return commentService.getSnapshot(req.user.sub, presenceService.getOnlineUsers());
  });
}
