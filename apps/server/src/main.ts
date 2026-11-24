import { config } from "./config.js";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const app = await buildApp();

// 优雅停机：先停止接收请求，再释放数据库连接，避免容器重启时丢请求
const shutdown = async (signal: string) => {
  app.log.info(`收到 ${signal}，开始优雅停机`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.PORT, host: "0.0.0.0" });
