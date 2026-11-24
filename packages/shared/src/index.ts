import { z } from "zod";

// ---- 领域枚举 ----
export const SENTIMENTS = ["PENDING", "POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const LAYOUT_MODES = ["free", "organized"] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export const TOOL_MODES = ["create", "like", "drag"] as const;
export type ToolMode = (typeof TOOL_MODES)[number];

// ---- 统一错误码：REST 与 Socket ack 共用 ----
export const ERROR_CODES = {
  VALIDATION: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export type AckResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

// ---- 认证校验规则：前后端共用，避免两侧限制漂移 ----
// 用户名限制字符集，避免空白/特殊字符造成展示和排查问题
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "用户名至少 3 个字符")
  .max(20, "用户名最多 20 个字符")
  .regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, "仅支持字母、数字、下划线和中文");

export const passwordSchema = z
  .string()
  .min(6, "密码至少 6 位")
  .max(64, "密码最多 64 位");

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  nickname: z.string().trim().min(1).max(20).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---- 评论校验规则：限制文本长度与世界坐标范围，防止越界或恶意大包 ----
export const WORLD_COORD_LIMIT = 10000;

const worldCoordSchema = z
  .number()
  .finite("坐标必须为有效数值")
  .min(-WORLD_COORD_LIMIT, "坐标超出画布范围")
  .max(WORLD_COORD_LIMIT, "坐标超出画布范围");

const commentContentSchema = z
  .string()
  .trim()
  .min(1, "评论内容不能为空")
  .max(500, "评论最多 500 字");

export const createCommentSchema = z.object({
  content: commentContentSchema,
  x: worldCoordSchema,
  y: worldCoordSchema,
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  id: z.string().min(1),
  content: commentContentSchema,
  version: z.number().int().positive(),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const dragCommentSchema = z.object({
  id: z.string().min(1),
  x: worldCoordSchema,
  y: worldCoordSchema,
});
export type DragCommentInput = z.infer<typeof dragCommentSchema>;

export const moveCommentSchema = z.object({
  id: z.string().min(1),
  x: worldCoordSchema,
  y: worldCoordSchema,
  version: z.number().int().positive(),
});
export type MoveCommentInput = z.infer<typeof moveCommentSchema>;

export const deleteCommentSchema = z.object({
  id: z.string().min(1),
});
export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;

export const likeCommentSchema = z.object({
  id: z.string().min(1),
});
export type LikeCommentInput = z.infer<typeof likeCommentSchema>;

export const boardLayoutSchema = z.object({
  mode: z.enum(LAYOUT_MODES),
});
export type BoardLayoutInput = z.infer<typeof boardLayoutSchema>;

// ---- DTO ----
export interface UserDTO {
  id: string;
  username: string;
  nickname: string;
  avatarColor: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface CommentDTO {
  id: string;
  authorId: string;
  author: UserDTO;
  content: string;
  x: number;
  y: number;
  zIndex: number;
  rotation: number;
  sentiment: Sentiment;
  version: number;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BoardSnapshotDTO {
  comments: CommentDTO[];
  layoutMode: LayoutMode;
  onlineUsers: UserDTO[];
  updatedAt: string;
}

export interface CommentDraggingDTO {
  id: string;
  x: number;
  y: number;
  byUserId: string;
  byNickname: string;
}

export interface CommentRemovedDTO {
  id: string;
}

export interface CommentSentimentDTO {
  id: string;
  sentiment: Sentiment;
  version: number;
  updatedAt: string;
}

export interface BoardLayoutDTO {
  mode: LayoutMode;
  updatedAt: string;
}

// ---- Socket.IO 事件名常量：前后端严格引用同一份定义 ----
export const SOCKET_EVENTS = {
  BOARD_SNAPSHOT: "board:snapshot",
  BOARD_SYNC: "board:sync",
  PRESENCE_UPDATE: "presence:update",
  COMMENT_CREATE: "comment:create",
  COMMENT_UPDATE: "comment:update",
  COMMENT_DRAG: "comment:drag",
  COMMENT_MOVE: "comment:move",
  COMMENT_DELETE: "comment:delete",
  COMMENT_LIKE: "comment:like",
  COMMENT_UPSERTED: "comment:upserted",
  COMMENT_REMOVED: "comment:removed",
  COMMENT_DRAGGING: "comment:dragging",
  COMMENT_SENTIMENT: "comment:sentiment",
  BOARD_LAYOUT: "board:layout",
} as const;

// ---- 演示账号元信息：与 seed.ts 保持一致，供登录页一键切换 ----
export const DEMO_ACCOUNTS = [
  { username: "alice", nickname: "Alice", avatarColor: "#F87171" },
  { username: "bob", nickname: "Bob", avatarColor: "#60A5FA" },
  { username: "carol", nickname: "Carol", avatarColor: "#34D399" },
] as const;
export const DEMO_PASSWORD = "demo123";

export {
  computeMoodStats,
  organizeComments,
  sentimentToColumn,
  type MoodColumn,
  type MoodStats,
  type OrganizedPosition,
} from "./layout.js";
