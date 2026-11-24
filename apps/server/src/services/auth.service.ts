import bcrypt from "bcryptjs";
import type { LoginInput, RegisterInput, UserDTO } from "@wall/shared";
import { AppError } from "../lib/errors.js";
import { userRepository } from "../repositories/user.repository.js";

// 头像色盘：用户没有上传头像，用稳定的颜色 + 首字作为头像
const AVATAR_COLORS = ["#F87171", "#FB923C", "#FBBF24", "#34D399", "#22D3EE", "#60A5FA", "#A78BFA", "#F472B6"];

const BCRYPT_COST = 10;

// 登录失败统一提示，避免通过不同文案枚举出已存在的用户名
const INVALID_CREDENTIALS = "用户名或密码错误";

type UserRecord = NonNullable<Awaited<ReturnType<typeof userRepository.findById>>>;

export function toUserDTO(user: UserRecord): UserDTO {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarColor: user.avatarColor,
  };
}

export const authService = {
  async register(input: RegisterInput): Promise<UserDTO> {
    const existing = await userRepository.findByUsername(input.username);
    if (existing) throw AppError.conflict("用户名已被占用");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!;

    try {
      const user = await userRepository.create({
        username: input.username,
        passwordHash,
        nickname: input.nickname ?? input.username,
        avatarColor,
      });
      return toUserDTO(user);
    } catch (err) {
      // 并发注册同名用户时，唯一索引冲突（Prisma P2002）转换为业务错误
      if ((err as { code?: string }).code === "P2002") throw AppError.conflict("用户名已被占用");
      throw err;
    }
  },

  async login(input: LoginInput): Promise<UserDTO> {
    const user = await userRepository.findByUsername(input.username);
    if (!user) throw AppError.unauthorized(INVALID_CREDENTIALS);

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw AppError.unauthorized(INVALID_CREDENTIALS);

    return toUserDTO(user);
  },

  async getById(id: string): Promise<UserDTO> {
    const user = await userRepository.findById(id);
    // token 有效但用户已不存在（如库被重置）时按未登录处理
    if (!user) throw AppError.unauthorized();
    return toUserDTO(user);
  },
};
