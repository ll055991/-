# 多阶段构建：先构建前端与服务端，再产出精简运行镜像
FROM node:22-slim AS build
WORKDIR /app
# Prisma 引擎依赖 openssl
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# 固定 pnpm 版本，保证与本地 lockfile 生成环境一致
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-slim
WORKDIR /app/apps/server
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 3000
# 运行阶段直接调用 node_modules 中的二进制，不再依赖 pnpm/corepack，
# 避免容器启动时联网下载包管理器导致启动慢或离线环境失败。
# 启动前先应用迁移并写入演示账号（均可重复执行）
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/tsx prisma/seed.ts && node dist/main.js"]
