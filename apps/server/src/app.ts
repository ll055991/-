import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { ERROR_CODES } from "@wall/shared";
import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import { authController } from "./controllers/auth.controller.js";
import { boardController } from "./controllers/board.controller.js";
import { setupBoardGateway } from "./gateways/board.gateway.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(fastifyJwt, { secret: config.JWT_SECRET });

  // 统一鉴权钩子：校验失败一律转成 401 业务错误
  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw AppError.unauthorized();
    }
  });

  // 统一错误出口：业务异常按状态码返回，未知异常只记录日志，不向客户端泄露细节
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ code: err.code, message: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ code: ERROR_CODES.INTERNAL, message: "服务器内部错误" });
  });

  app.get("/api/health", async () => ({ ok: true }));
  await app.register(authController);
  await app.register(boardController);
  setupBoardGateway(app);

  // 生产形态：由同一进程托管前端构建产物，同源访问可避免 CORS 与 WebSocket 跨域问题
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) {
        return reply.code(404).send({ code: ERROR_CODES.NOT_FOUND, message: "接口不存在" });
      }
      // SPA 路由回退
      return reply.sendFile("index.html");
    });
  }

  return app;
}
