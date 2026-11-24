import type {
  BoardLayoutDTO,
  BoardSnapshotDTO,
  CommentDTO,
  CreateCommentInput,
  LayoutMode,
  MoveCommentInput,
  UpdateCommentInput,
  UserDTO,
} from "@wall/shared";
import { AppError } from "../lib/errors.js";
import { commentRepository } from "../repositories/comment.repository.js";
import { sentimentService } from "../sentiment/sentiment.service.js";
import { toUserDTO } from "./auth.service.js";

type CommentWithAuthor = NonNullable<Awaited<ReturnType<typeof commentRepository.findActiveById>>>;

// 所有权轻量缓存：供高频 comment:drag 帧做零写库鉴权，避免每次鼠标移动都查库
const ownershipCache = new Map<string, string>();

function toCommentDTO(record: CommentWithAuthor, likedByMe = false): CommentDTO {
  return {
    id: record.id,
    authorId: record.authorId,
    author: toUserDTO(record.author),
    content: record.content,
    x: record.x,
    y: record.y,
    zIndex: record.zIndex,
    rotation: record.rotation,
    sentiment: record.sentiment,
    version: record.version,
    likeCount: record.likeCount,
    likedByMe,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// 贴纸轻微随机倾角（-3.5° ~ 3.5°），还原实体意见墙手贴质感
function randomStickyRotation(): number {
  return Math.round((Math.random() * 7 - 3.5) * 10) / 10;
}

export const commentService = {
  async getSnapshot(viewerId: string, onlineUsers: UserDTO[]): Promise<BoardSnapshotDTO> {
    const [records, boardState] = await Promise.all([
      commentRepository.findAllActive(viewerId),
      commentRepository.getBoardState(),
    ]);

    const comments: CommentDTO[] = records.map((r) => {
      ownershipCache.set(r.id, r.authorId);
      return toCommentDTO(r, r.likes.length > 0);
    });

    // 画板最后更新时间取最新评论或全局状态的较新值
    const latestCommentTime = records.reduce(
      (max, r) => (r.updatedAt.getTime() > max ? r.updatedAt.getTime() : max),
      boardState.updatedAt.getTime(),
    );

    const layoutMode: LayoutMode =
      boardState.layoutMode === "organized" ? "organized" : "free";

    return {
      comments,
      layoutMode,
      onlineUsers,
      updatedAt: new Date(latestCommentTime).toISOString(),
    };
  },

  async create(userId: string, input: CreateCommentInput): Promise<CommentDTO> {
    const maxZ = await commentRepository.getMaxZIndex();
    const created = await commentRepository.create({
      authorId: userId,
      content: input.content,
      x: input.x,
      y: input.y,
      zIndex: maxZ + 1,
      rotation: randomStickyRotation(),
    });
    ownershipCache.set(created.id, created.authorId);
    // 异步入队情绪识别，不阻塞发帖响应
    sentimentService.enqueue(created.id, created.content);
    return toCommentDTO(created, false);
  },

  async updateContent(userId: string, input: UpdateCommentInput): Promise<CommentDTO> {
    const existing = await commentRepository.findActiveById(input.id);
    if (!existing) throw AppError.notFound("评论不存在或已被删除");
    if (existing.authorId !== userId) throw AppError.forbidden("只能编辑自己的评论");

    const updated = await commentRepository.updateContentWithVersion(
      input.id,
      input.version,
      input.content,
    );
    if (!updated) throw AppError.conflict("评论状态已变更，请重试");
    // 编辑内容后重新触发情绪分析
    sentimentService.enqueue(updated.id, updated.content);
    return toCommentDTO(updated, false);
  },

  async verifyDragOwnership(userId: string, commentId: string): Promise<void> {
    let ownerId = ownershipCache.get(commentId);
    if (!ownerId) {
      const existing = await commentRepository.findActiveById(commentId);
      if (!existing) throw AppError.notFound("评论不存在或已被删除");
      ownerId = existing.authorId;
      ownershipCache.set(commentId, ownerId);
    }
    if (ownerId !== userId) throw AppError.forbidden("只能拖动自己的评论卡片");
  },

  async move(userId: string, input: MoveCommentInput): Promise<CommentDTO> {
    const boardState = await commentRepository.getBoardState();
    // 整理模式下禁用拖动，避免“拖动展示坐标还是真实自由坐标”的语义歧义
    if (boardState.layoutMode === "organized") {
      throw AppError.conflict("智能整理模式下不支持拖动卡片，请先切回自由画布");
    }

    const existing = await commentRepository.findActiveById(input.id);
    if (!existing) throw AppError.notFound("评论不存在或已被删除");
    if (existing.authorId !== userId) throw AppError.forbidden("只能拖动自己的评论卡片");

    const maxZ = await commentRepository.getMaxZIndex();
    // 拖拽落库时将卡片置于顶层，符合实体墙“移动后盖在最上面”的直觉
    const nextZ = existing.zIndex >= maxZ && maxZ > 0 ? existing.zIndex : maxZ + 1;
    const updated = await commentRepository.updatePositionWithVersion(
      input.id,
      input.version,
      input.x,
      input.y,
      nextZ,
    );
    if (!updated) throw AppError.conflict("卡片位置已变更，请重试");
    return toCommentDTO(updated, false);
  },

  async remove(userId: string, id: string): Promise<void> {
    const existing = await commentRepository.findActiveById(id);
    if (!existing) throw AppError.notFound("评论不存在或已被删除");
    if (existing.authorId !== userId) throw AppError.forbidden("只能删除自己的评论");

    await commentRepository.softDelete(id);
    ownershipCache.delete(id);
  },

  async toggleLike(userId: string, commentId: string): Promise<CommentDTO> {
    const existing = await commentRepository.findActiveById(commentId);
    if (!existing) throw AppError.notFound("评论不存在或已被删除");
    // 严格呼应题目“只能阅读和点赞别人的卡片”，后端强制禁止自赞
    if (existing.authorId === userId) throw AppError.forbidden("不能给自己的评论点赞");

    try {
      const { comment, likedByMe } = await commentRepository.toggleLike(userId, commentId);
      return toCommentDTO(comment, likedByMe);
    } catch (err) {
      // 同一用户极端并发双重点赞撞到联合主键约束（P2002）时，按冲突提示客户端重试
      if ((err as { code?: string }).code === "P2002") {
        throw AppError.conflict("点赞状态正在更新，请稍后再试");
      }
      throw err;
    }
  },

  async setLayoutMode(mode: LayoutMode): Promise<BoardLayoutDTO> {
    const state = await commentRepository.setBoardLayoutMode(mode);
    return {
      mode: state.layoutMode === "organized" ? "organized" : "free",
      updatedAt: state.updatedAt.toISOString(),
    };
  },
};
