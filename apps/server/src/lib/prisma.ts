import { PrismaClient } from "@prisma/client";

// 进程内单例，避免重复创建连接池
export const prisma = new PrismaClient();
