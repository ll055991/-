import { describe, expect, it } from "vitest";
import type { UserDTO } from "@wall/shared";
import { PresenceService } from "../presence.service.js";

const alice: UserDTO = { id: "u-alice", username: "alice", nickname: "Alice", avatarColor: "#F87171" };
const bob: UserDTO = { id: "u-bob", username: "bob", nickname: "Bob", avatarColor: "#60A5FA" };

describe("PresenceService 在线状态与多标签页去重", () => {
  it("同一用户多标签页仅计为在线一人，全部断开后才离线", () => {
    const svc = new PresenceService();

    expect(svc.join("s1", alice)).toBe(true);
    expect(svc.join("s2", alice)).toBe(false);
    expect(svc.join("s3", bob)).toBe(true);
    expect(svc.getOnlineUsers()).toHaveLength(2);

    // 关闭 alice 的第一个标签页，仍保持在线
    expect(svc.leave("s1")).toBe(false);
    expect(svc.getOnlineUsers()).toHaveLength(2);

    // 关闭 alice 的最后一个标签页，触发离线通知
    expect(svc.leave("s2")).toBe(true);
    expect(svc.getOnlineUsers().map((u) => u.id)).toEqual(["u-bob"]);

    // 重复离开未知 socket 安全返回 false
    expect(svc.leave("unknown")).toBe(false);
  });
});
