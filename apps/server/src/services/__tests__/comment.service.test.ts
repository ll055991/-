import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "@wall/shared";

// 隔离数据库与后台情绪队列，专注测试 Service 层的业务规则与权限边界
vi.mock("../../repositories/comment.repository.js", () => ({
  commentRepository: {
    findActiveById: vi.fn(),
    getBoardState: vi.fn(),
    getMaxZIndex: vi.fn(),
    create: vi.fn(),
    updateContentWithVersion: vi.fn(),
    updatePositionWithVersion: vi.fn(),
    softDelete: vi.fn(),
    toggleLike: vi.fn(),
  },
}));

vi.mock("../../sentiment/sentiment.service.js", () => ({
  sentimentService: {
    enqueue: vi.fn(),
  },
}));

import { commentRepository } from "../../repositories/comment.repository.js";
import { sentimentService } from "../../sentiment/sentiment.service.js";
import { commentService } from "../comment.service.js";

const mockAuthor = {
  id: "u-alice",
  username: "alice",
  passwordHash: "hash",
  nickname: "Alice",
  avatarColor: "#F87171",
  createdAt: new Date("2026-11-23T10:00:00.000Z"),
};

const mockComment = {
  id: "c-1",
  authorId: "u-alice",
  author: mockAuthor,
  content: "原始评论",
  x: 100,
  y: 200,
  zIndex: 1,
  rotation: 1.5,
  sentiment: "PENDING" as const,
  sentimentBy: null,
  version: 1,
  likeCount: 0,
  deletedAt: null,
  createdAt: new Date("2026-11-23T10:00:00.000Z"),
  updatedAt: new Date("2026-11-23T10:00:00.000Z"),
};

describe("commentService 权限边界与业务规则", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("禁止非作者编辑、拖动、移动和删除他人评论", async () => {
    vi.mocked(commentRepository.findActiveById).mockResolvedValue(mockComment);
    vi.mocked(commentRepository.getBoardState).mockResolvedValue({
      id: 1,
      layoutMode: "free",
      updatedAt: new Date(),
    });

    await expect(
      commentService.updateContent("u-bob", { id: "c-1", content: "篡改", version: 1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });

    await expect(commentService.verifyDragOwnership("u-bob", "c-1")).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });

    await expect(
      commentService.move("u-bob", { id: "c-1", x: 300, y: 300, version: 1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });

    await expect(commentService.remove("u-bob", "c-1")).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });
  });

  it("禁止作者给自己的评论点赞", async () => {
    vi.mocked(commentRepository.findActiveById).mockResolvedValue(mockComment);

    await expect(commentService.toggleLike("u-alice", "c-1")).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });
    expect(commentRepository.toggleLike).not.toHaveBeenCalled();
  });

  it("智能整理模式下禁止移动卡片以保护自由态原坐标", async () => {
    vi.mocked(commentRepository.getBoardState).mockResolvedValue({
      id: 1,
      layoutMode: "organized",
      updatedAt: new Date(),
    });

    await expect(
      commentService.move("u-alice", { id: "c-1", x: 200, y: 200, version: 1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT });
  });

  it("创建评论后异步入队情绪识别", async () => {
    vi.mocked(commentRepository.getMaxZIndex).mockResolvedValue(3);
    vi.mocked(commentRepository.create).mockResolvedValue(mockComment);

    const created = await commentService.create("u-alice", {
      content: "测试发帖",
      x: 100,
      y: 200,
    });

    expect(created.id).toBe("c-1");
    expect(sentimentService.enqueue).toHaveBeenCalledWith("c-1", "原始评论");
  });
});
