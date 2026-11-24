import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: "../../.env" });

const prisma = new PrismaClient();

// 演示账号：登录页的“一键切换”入口依赖这些固定账号，密码统一便于评审验收
const DEMO_PASSWORD = "demo123";
const DEMO_USERS = [
  { username: "alice", nickname: "Alice", avatarColor: "#F87171" },
  { username: "bob", nickname: "Bob", avatarColor: "#60A5FA" },
  { username: "carol", nickname: "Carol", avatarColor: "#34D399" },
];

// 初始示例贴纸：仅在墙面为空时写入，让评审启动后第一眼即可体验画布、情绪概览与智能整理
const SEED_COMMENTS = [
  {
    username: "alice",
    content: "表扬这次新上线的财务报销系统！手机上一键提交、流程清晰高效，平均打款时间缩短了一半，建议全公司推广。",
    x: 110,
    y: 150,
    rotation: -2.2,
    sentiment: "POSITIVE" as const,
  },
  {
    username: "bob",
    content: "感谢公司在休息区增设的静音舱，对需要深度思考的岗位非常有用，极大提升了幸福感。",
    x: 420,
    y: 135,
    rotation: 1.8,
    sentiment: "POSITIVE" as const,
  },
  {
    username: "carol",
    content: "目前业务侧和技术侧的沟通成本很高，每次遇到边界模糊的问题都在先自证清白，严重内耗，项目推进越来越难。",
    x: 730,
    y: 155,
    rotation: -1.5,
    sentiment: "NEGATIVE" as const,
  },
  {
    username: "alice",
    content: "最近公司规模扩大，工位排布比较紧凑，希望行政同学评估优化一下下午会议室的通风系统。",
    x: 145,
    y: 380,
    rotation: 2.4,
    sentiment: "NEUTRAL" as const,
  },
  {
    username: "bob",
    content: "部门最近出现了一些表演性加班风气，消耗了大家的热情，希望能更加看重产出效率而不是工时。",
    x: 455,
    y: 365,
    rotation: -2.6,
    sentiment: "NEGATIVE" as const,
  },
  {
    username: "carol",
    content: "周五下午三点在三楼大会议室同步下季度产品排期，欢迎各位同学提前在墙上补充想法。",
    x: 765,
    y: 385,
    rotation: 1.4,
    sentiment: "NEUTRAL" as const,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userByName = new Map<string, string>();

  for (const u of DEMO_USERS) {
    // upsert 保证 seed 可重复执行（容器每次启动都会跑）
    const saved = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash },
    });
    userByName.set(u.username, saved.id);
  }
  await prisma.boardState.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const activeCount = await prisma.comment.count({ where: { deletedAt: null } });
  if (activeCount === 0) {
    for (let i = 0; i < SEED_COMMENTS.length; i++) {
      const item = SEED_COMMENTS[i]!;
      const authorId = userByName.get(item.username)!;
      await prisma.comment.create({
        data: {
          authorId,
          content: item.content,
          x: item.x,
          y: item.y,
          zIndex: i + 1,
          rotation: item.rotation,
          sentiment: item.sentiment,
          sentimentBy: "lexicon",
        },
      });
    }
    console.log(`已写入 ${SEED_COMMENTS.length} 条初始示例评论贴纸`);
  }

  console.log(`seed 完成：${DEMO_USERS.map((u) => u.username).join(", ")}（密码 ${DEMO_PASSWORD}）`);
}

main().finally(() => prisma.$disconnect());
