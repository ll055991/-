import type { LayoutMode } from "@wall/shared";
import { prisma } from "../lib/prisma.js";

export interface CreateCommentRecord {
  authorId: string;
  content: string;
  x: number;
  y: number;
  zIndex: number;
  rotation: number;
}

// Repository 只做数据访问，不含权限或业务规则判断
export const commentRepository = {
  findAllActive(viewerId: string) {
    return prisma.comment.findMany({
      where: { deletedAt: null },
      orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }],
      include: {
        author: true,
        likes: { where: { userId: viewerId }, select: { userId: true } },
      },
    });
  },

  findActiveById(id: string) {
    return prisma.comment.findFirst({
      where: { id, deletedAt: null },
      include: { author: true },
    });
  },

  async getMaxZIndex(): Promise<number> {
    const agg = await prisma.comment.aggregate({
      where: { deletedAt: null },
      _max: { zIndex: true },
    });
    return agg._max.zIndex ?? 0;
  },

  create(data: CreateCommentRecord) {
    return prisma.comment.create({
      data,
      include: { author: true },
    });
  },

  // 使用 updateMany 携带 version 条件实现数据库层乐观锁，内容修改后将情绪重置为待分析
  async updateContentWithVersion(id: string, version: number, content: string) {
    const res = await prisma.comment.updateMany({
      where: { id, version, deletedAt: null },
      data: { content, sentiment: "PENDING", sentimentBy: null, version: { increment: 1 } },
    });
    if (res.count === 0) return null;
    return prisma.comment.findFirst({
      where: { id, deletedAt: null },
      include: { author: true },
    });
  },

  // 仅在评论未删除且内容未再次变更时回写情绪，防止慢请求覆盖新编辑内容的情绪结果
  async updateSentimentIfContentMatches(
    id: string,
    content: string,
    sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE",
    sentimentBy: string,
  ) {
    const res = await prisma.comment.updateMany({
      where: { id, content, deletedAt: null },
      data: { sentiment, sentimentBy, version: { increment: 1 } },
    });
    if (res.count === 0) return null;
    return prisma.comment.findFirst({ where: { id, deletedAt: null } });
  },

  async updatePositionWithVersion(
    id: string,
    version: number,
    x: number,
    y: number,
    zIndex: number,
  ) {
    const res = await prisma.comment.updateMany({
      where: { id, version, deletedAt: null },
      data: { x, y, zIndex, version: { increment: 1 } },
    });
    if (res.count === 0) return null;
    return prisma.comment.findFirst({
      where: { id, deletedAt: null },
      include: { author: true },
    });
  },

  softDelete(id: string) {
    return prisma.comment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },

  // 点赞切换：在事务内通过联合主键与 deleteMany 计数保证 Like 记录与冗余 likeCount 严格一致
  async toggleLike(userId: string, commentId: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.like.findUnique({
        where: { userId_commentId: { userId, commentId } },
      });

      if (existing) {
        const deleted = await tx.like.deleteMany({ where: { userId, commentId } });
        const comment =
          deleted.count > 0
            ? await tx.comment.update({
                where: { id: commentId },
                data: { likeCount: { decrement: 1 }, version: { increment: 1 } },
                include: { author: true },
              })
            : await tx.comment.findUniqueOrThrow({
                where: { id: commentId },
                include: { author: true },
              });
        return { comment, likedByMe: false };
      }

      await tx.like.create({ data: { userId, commentId } });
      const comment = await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 }, version: { increment: 1 } },
        include: { author: true },
      });
      return { comment, likedByMe: true };
    });
  },

  async getBoardState() {
    const state = await prisma.boardState.findUnique({ where: { id: 1 } });
    return state ?? { id: 1, layoutMode: "free", updatedAt: new Date() };
  },

  setBoardLayoutMode(mode: LayoutMode) {
    return prisma.boardState.upsert({
      where: { id: 1 },
      update: { layoutMode: mode },
      create: { id: 1, layoutMode: mode },
    });
  },
};
