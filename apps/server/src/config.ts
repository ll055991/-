import dotenv from "dotenv";
import { z } from "zod";

// 脚本均在 apps/server 目录下运行，根目录 .env 需显式指定；文件不存在时静默跳过（Docker 直接注入环境变量）
dotenv.config({ path: "../../.env" });

// 启动时统一校验环境变量：配置缺失/非法时立刻失败，避免运行中途才暴露问题
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET 至少 16 个字符"),
  PORT: z.coerce.number().int().positive().default(3000),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("环境变量校验失败:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
