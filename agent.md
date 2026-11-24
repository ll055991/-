# 项目协作与开发指南（agent.md）

本项目为**鹰眼智能 2027 校园招聘代码考核：实时评论墙**。所有设计与实现以 [docs/architecture.md](docs/architecture.md) 为唯一架构基线。

## 1. 技术栈与 Monorepo 结构

- **包管理**：pnpm workspace（Node >= 20，TypeScript `strict` 模式）
- **目录职责**：
  - `packages/shared`（`@wall/shared`）：前后端共享的领域类型、Socket 事件常量、Zod 校验 Schema、统一错误码、智能整理布局纯函数。**契约只定义一次，禁止在两端重复声明。**
  - `apps/server`（`@wall/server`）：Fastify 5 + Socket.IO 4 + Prisma 6 + PostgreSQL 16。
  - `apps/web`（`@wall/web`）：React 18 + Vite 6 + Tailwind CSS 4 + Zustand 5 + Socket.IO Client。
  - `docs/architecture.md`：完整架构方案与里程碑规划。

## 2. 架构红线（强约束）

1. **后端分层约束**：
   - `controllers/` 与 `gateways/` 只负责协议解析、Zod 校验、提取已认证 `userId`、调用 Service 与返回统一格式（HTTP 响应或 Socket `ack`）。
   - `services/` 承载**全部业务规则与权限校验**（如 `authorId === userId`、乐观锁版本检查、禁止自赞等）。REST 与 Socket 必须共用 Service，禁止在 Gateway 绕过 Service 直接操作数据库。
   - `repositories/` 只封装 Prisma 数据访问，不包含业务判断。
2. **身份与安全边界**：
   - 绝不采信客户端提交的 `authorId` 或 `userId`，统一以 JWT 解析结果（REST 的 `req.user.sub`、Socket 的 `socket.data.userId`）为准。
   - 所有 C→S Socket 事件必须使用 `ack` 回调，返回 `{ ok: true, data }` 或 `{ ok: false, code, message }`。
3. **实时同步与一致性**：
   - `comment:drag` 仅在服务端校验所有权后内存转发（`comment:dragging`），**禁止写库**；松手时通过 `comment:move` 落库并广播权威态 `comment:upserted`。
   - `Comment.version` 单调递增；客户端收到 `version <= 本地版本` 的权威事件直接丢弃，防止乱序回跳。
   - 连接及断线重连后服务端统一推送 `board:snapshot`，客户端以快照对账。
   - 在线状态按 `userId` 维护连接引用计数，同一用户多标签页只计为在线一人，且当前用户在侧边栏置顶。
4. **前端状态隔离**：
   - 评论集合与在线状态存放在业务 Store（`useBoardStore`）；画布视口（`offsetX`、`offsetY`、`scale`）独立存放在视口 Store（`useViewportStore`），避免平移/缩放画布时触发所有卡片重渲染。
   - 卡片位置与动画优先使用 CSS `transform`（GPU 合成），避免触发高频布局重排。

## 3. 代码与注释规范

- 所有文档、说明与代码注释**必须使用简体中文**；代码标识符保持英文，禁止拼音。
- 注释只解释**为什么这样设计**、复杂逻辑、业务判断与边界条件，禁止无意义的字面翻译注释。
- 环境变量通过 `apps/server/src/config.ts` 用 Zod 启动校验，新增配置须同步更新 `.env.example` 与 `docker-compose.yml`。

## 4. 常用命令

```bash
# 仅启动数据库（宿主机映射到 5433，避免与本地 5432 冲突）
docker compose up -d db

# 数据库迁移与演示账号初始化（alice / bob / carol，密码 demo123）
pnpm --filter @wall/server db:deploy
pnpm db:seed

# 本地开发
pnpm dev:server    # Fastify + Socket.IO (:3000)
pnpm dev:web       # Vite 开发服 (:5173，已代理 /api 与 /socket.io)

# 类型检查、构建与测试
pnpm typecheck
pnpm build
pnpm test

# 一键容器化部署验证
docker compose up -d --build
```

## 5. 开发里程碑跟踪

- [x] **M1**：Monorepo 骨架、Prisma schema 与迁移、注册/登录/me 认证、Docker Compose
- [x] **M2**：登录页、画布（虚拟世界坐标平移/缩放）、创建/编辑/拖动/删除评论、在线列表、Socket.IO 实时同步
- [x] **M3**：点赞（防自赞/联合主键事务）、权限细节完善、重连对账强化、按 Figma 还原视觉样式
- [x] **M4**：异步情绪识别引擎（LLM + 本地词典降级）、MoodBar、智能整理全局无损切换
- [x] **M5**：Vitest 单元与双端 Socket 集成测试、README 文档完善
