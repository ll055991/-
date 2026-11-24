import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema, type AuthResponse } from "@wall/shared";
import { AppError } from "../lib/errors.js";
import { authService } from "../services/auth.service.js";

export async function authController(app: FastifyInstance) {
  // 签发 token 的逻辑集中在这里，Service 只关心用户身份
  const issue = async (user: AuthResponse["user"]): Promise<AuthResponse> => ({
    token: app.jwt.sign({ sub: user.id }, { expiresIn: "7d" }),
    user,
  });

  app.post("/api/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
    const user = await authService.register(parsed.data);
    return reply.code(201).send(await issue(user));
  });

  app.post("/api/auth/login", async (req) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "参数错误");
    return issue(await authService.login(parsed.data));
  });

  app.get("/api/auth/me", { preHandler: app.authenticate }, async (req) => {
    return authService.getById(req.user.sub);
  });
}
