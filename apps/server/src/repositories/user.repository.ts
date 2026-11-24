import { prisma } from "../lib/prisma.js";

export interface CreateUserData {
  username: string;
  passwordHash: string;
  nickname: string;
  avatarColor: string;
}

// Repository 只做数据访问，不含任何业务规则
export const userRepository = {
  findByUsername: (username: string) => prisma.user.findUnique({ where: { username } }),
  findById: (id: string) => prisma.user.findUnique({ where: { id } }),
  create: (data: CreateUserData) => prisma.user.create({ data }),
};
