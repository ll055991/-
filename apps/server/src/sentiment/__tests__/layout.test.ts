import { describe, expect, it } from "vitest";
import { computeMoodStats, organizeComments, type CommentDTO } from "@wall/shared";

function makeComment(
  id: string,
  sentiment: CommentDTO["sentiment"],
  createdAt: string,
  content = "测试评论内容",
): CommentDTO {
  return {
    id,
    authorId: "u1",
    author: { id: "u1", username: "alice", nickname: "Alice", avatarColor: "#F87171" },
    content,
    x: 500,
    y: 400,
    zIndex: 1,
    rotation: 2.5,
    sentiment,
    version: 1,
    likeCount: 0,
    likedByMe: false,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("@wall/shared 智能整理与情绪统计纯函数", () => {
  it("organizeComments 按情绪分三列、列内按时间升序、倾角归零且不修改原坐标", () => {
    const c1 = makeComment("c1", "POSITIVE", "2026-11-23T10:02:00.000Z");
    const c2 = makeComment("c2", "POSITIVE", "2026-11-23T10:01:00.000Z");
    const c3 = makeComment("c3", "PENDING", "2026-11-23T10:00:00.000Z");
    const c4 = makeComment("c4", "NEGATIVE", "2026-11-23T10:03:00.000Z");

    const layout = organizeComments([c1, c2, c3, c4]);

    const p1 = layout.get("c1")!;
    const p2 = layout.get("c2")!;
    const p3 = layout.get("c3")!;
    const p4 = layout.get("c4")!;

    // 分列准确且从左到右排列：正面 < 中性 < 负面
    expect(p2.column).toBe("POSITIVE");
    expect(p3.column).toBe("NEUTRAL");
    expect(p4.column).toBe("NEGATIVE");
    expect(p2.x).toBeLessThan(p3.x);
    expect(p3.x).toBeLessThan(p4.x);

    // 同列内按时间升序（c2 早于 c1，故 c2 在上方），且倾角归零
    expect(p2.y).toBeLessThan(p1.y);
    expect(p1.rotation).toBe(0);

    // 无损保护：原始 CommentDTO 坐标和倾角未被篡改
    expect(c1.x).toBe(500);
    expect(c1.rotation).toBe(2.5);
  });

  it("computeMoodStats 空集合返回全 0，非空集合三项百分比恒等于 100", () => {
    expect(computeMoodStats([])).toEqual({
      positive: 0,
      neutral: 0,
      negative: 0,
      total: 0,
      positivePct: 0,
      neutralPct: 0,
      negativePct: 0,
    });

    const stats = computeMoodStats([
      makeComment("1", "POSITIVE", "2026-11-23T10:00:00.000Z"),
      makeComment("2", "NEUTRAL", "2026-11-23T10:01:00.000Z"),
      makeComment("3", "NEGATIVE", "2026-11-23T10:02:00.000Z"),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.positivePct + stats.neutralPct + stats.negativePct).toBe(100);
  });
});
