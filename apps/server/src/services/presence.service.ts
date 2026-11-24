import type { UserDTO } from "@wall/shared";

interface PresenceEntry {
  user: UserDTO;
  sockets: Set<string>;
}

// 内存态在线用户管理：按 userId 维护连接集合，同一用户多标签页仅计为在线一人。
// 后续多实例水平扩展时，可将此 Service 替换为 Redis Hash + 心跳 TTL 实现。
export class PresenceService {
  private readonly byUser = new Map<string, PresenceEntry>();
  private readonly socketToUser = new Map<string, string>();

  join(socketId: string, user: UserDTO): boolean {
    this.socketToUser.set(socketId, user.id);
    const existing = this.byUser.get(user.id);
    if (existing) {
      existing.user = user;
      existing.sockets.add(socketId);
      return false;
    }
    this.byUser.set(user.id, { user, sockets: new Set([socketId]) });
    return true;
  }

  leave(socketId: string): boolean {
    const userId = this.socketToUser.get(socketId);
    if (!userId) return false;
    this.socketToUser.delete(socketId);

    const entry = this.byUser.get(userId);
    if (!entry) return false;
    entry.sockets.delete(socketId);
    if (entry.sockets.size === 0) {
      this.byUser.delete(userId);
      return true;
    }
    return false;
  }

  getOnlineUsers(): UserDTO[] {
    return Array.from(this.byUser.values(), (entry) => entry.user);
  }
}

export const presenceService = new PresenceService();
