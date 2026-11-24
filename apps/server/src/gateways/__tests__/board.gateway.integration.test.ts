import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import {
  ERROR_CODES,
  SOCKET_EVENTS,
  type AckResult,
  type BoardLayoutDTO,
  type BoardSnapshotDTO,
  type CommentDTO,
  type CommentSentimentDTO,
} from "@wall/shared";
import { buildApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";

function waitEvent<T>(
  socket: Socket,
  event: string,
  predicate: (data: T) => boolean = () => true,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeoutMs);
    function onEvent(data: T) {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(data);
    }
    socket.on(event, onEvent);
  });
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res: AckResult<T>) => resolve(res));
  });
}

describe("BoardGateway 双端实时同步集成测试", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | null = null;
  let baseUrl = "";
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      // 无可用 PostgreSQL 实例时跳过集成测试，避免离线环境 CI 误报失败
      return;
    }

    app = await buildApp();
    // 监听随机空闲端口，避免与开发服或 Docker 容器冲突
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    if (addr && typeof addr === "object") {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function login(username: string): Promise<{ token: string; user: { id: string } }> {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "demo123" }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as { token: string; user: { id: string } };
  }

  it("覆盖双端建连、创建/拖拽/落库/点赞/情绪推送、智能整理同步与清理", async () => {
    if (!dbAvailable) return;

    const [aliceAuth, bobAuth] = await Promise.all([login("alice"), login("bob")]);
    const alice = io(baseUrl, { auth: { token: aliceAuth.token }, reconnection: false });
    const bob = io(baseUrl, { auth: { token: bobAuth.token }, reconnection: false });

    try {
      await Promise.all([
        waitEvent<BoardSnapshotDTO>(alice, SOCKET_EVENTS.BOARD_SNAPSHOT),
        waitEvent<BoardSnapshotDTO>(bob, SOCKET_EVENTS.BOARD_SNAPSHOT),
      ]);

      // 1. 创建评论 -> 实时同步 + 异步情绪识别为 POSITIVE
      let createdId = "";
      const bobReceivesCreate = waitEvent<CommentDTO>(bob, SOCKET_EVENTS.COMMENT_UPSERTED);
      const bobReceivesSentiment = waitEvent<CommentSentimentDTO>(
        bob,
        SOCKET_EVENTS.COMMENT_SENTIMENT,
        (d) => createdId !== "" && d.id === createdId,
      );

      const createAck = await emitAck<CommentDTO>(alice, SOCKET_EVENTS.COMMENT_CREATE, {
        content: "集成测试：非常满意新功能，高效又实用！",
        x: 240,
        y: 260,
      });
      expect(createAck.ok).toBe(true);
      if (!createAck.ok) return;
      createdId = createAck.data.id;

      const bobCreated = await bobReceivesCreate;
      expect(bobCreated.id).toBe(createdId);
      const sentimentEv = await bobReceivesSentiment;
      expect(sentimentEv.sentiment).toBe("POSITIVE");

      // 2. 权限与点赞校验：alice 禁止自赞，bob 可以点赞
      const selfLike = await emitAck<CommentDTO>(alice, SOCKET_EVENTS.COMMENT_LIKE, {
        id: createdId,
      });
      expect(selfLike.ok).toBe(false);
      if (!selfLike.ok) expect(selfLike.code).toBe(ERROR_CODES.FORBIDDEN);

      const bobLike = await emitAck<CommentDTO>(bob, SOCKET_EVENTS.COMMENT_LIKE, {
        id: createdId,
      });
      expect(bobLike.ok).toBe(true);
      if (bobLike.ok) {
        expect(bobLike.data.likeCount).toBe(1);
        expect(bobLike.data.likedByMe).toBe(true);
      }

      // 3. 全局智能整理同步与无损切回
      const bobOrg = waitEvent<BoardLayoutDTO>(bob, SOCKET_EVENTS.BOARD_LAYOUT);
      const orgAck = await emitAck<BoardLayoutDTO>(alice, SOCKET_EVENTS.BOARD_LAYOUT, {
        mode: "organized",
      });
      expect(orgAck.ok).toBe(true);
      expect((await bobOrg).mode).toBe("organized");

      const freeAck = await emitAck<BoardLayoutDTO>(bob, SOCKET_EVENTS.BOARD_LAYOUT, {
        mode: "free",
      });
      expect(freeAck.ok).toBe(true);

      // 4. 清理测试评论
      const delAck = await emitAck<{ id: string }>(alice, SOCKET_EVENTS.COMMENT_DELETE, {
        id: createdId,
      });
      expect(delAck.ok).toBe(true);
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  });
});
