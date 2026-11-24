import { ERROR_CODES, type ErrorCode } from "@wall/shared";

// 业务异常：Service 层抛出，由全局错误处理器统一转换为 HTTP 响应（后续 Socket ack 也复用）
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }

  static validation(message: string) {
    return new AppError(ERROR_CODES.VALIDATION, message, 400);
  }
  static unauthorized(message = "未登录或登录已过期") {
    return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);
  }
  static forbidden(message = "无权执行该操作") {
    return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
  }
  static notFound(message = "资源不存在") {
    return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
  }
  static conflict(message: string) {
    return new AppError(ERROR_CODES.CONFLICT, message, 409);
  }
  static rateLimited(message = "操作过于频繁，请稍后再试") {
    return new AppError(ERROR_CODES.RATE_LIMITED, message, 429);
  }
}
