import type { CommentDTO, Sentiment } from "./index.js";

export type MoodColumn = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export interface OrganizedPosition {
  x: number;
  y: number;
  rotation: number;
  column: MoodColumn;
}

export interface MoodStats {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  positivePct: number;
  neutralPct: number;
  negativePct: number;
}

const COLUMN_X: Record<MoodColumn, number> = {
  POSITIVE: 120,
  NEUTRAL: 436,
  NEGATIVE: 752,
};

const START_Y = 128;
const CARD_GAP_Y = 20;

// 估算卡片高度：依据字数与换行符粗略推算，避免长文评论在整理列中发生纵向重叠
function estimateCardHeight(content: string): number {
  const paragraphs = content.split("\n");
  let lines = 0;
  for (const p of paragraphs) {
    // 卡片内容宽约 236px，13px 字体每行约 17 个中文字符
    lines += Math.max(1, Math.ceil(p.length / 17));
  }
  const textHeight = Math.max(58, lines * 22);
  // 内边距 + 底部作者/点赞栏约 96px
  return textHeight + 96;
}

export function sentimentToColumn(sentiment: Sentiment): MoodColumn {
  if (sentiment === "POSITIVE") return "POSITIVE";
  if (sentiment === "NEGATIVE") return "NEGATIVE";
  return "NEUTRAL";
}

// 确定性智能整理纯函数：放在 shared 中供前后端共享，确保所有客户端计算结果 100% 一致
export function organizeComments(
  comments: readonly CommentDTO[],
): Map<string, OrganizedPosition> {
  const buckets: Record<MoodColumn, CommentDTO[]> = {
    POSITIVE: [],
    NEUTRAL: [],
    NEGATIVE: [],
  };

  for (const c of comments) {
    buckets[sentimentToColumn(c.sentiment)].push(c);
  }

  const result = new Map<string, OrganizedPosition>();
  const columns: MoodColumn[] = ["POSITIVE", "NEUTRAL", "NEGATIVE"];

  for (const col of columns) {
    // 列内按创建时间升序，时间相同时按 id 兜底保证稳定序
    const list = buckets[col].sort((a, b) => {
      const diff = a.createdAt.localeCompare(b.createdAt);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    let cursorY = START_Y;
    for (const item of list) {
      result.set(item.id, {
        x: COLUMN_X[col],
        y: cursorY,
        rotation: 0,
        column: col,
      });
      cursorY += estimateCardHeight(item.content) + CARD_GAP_Y;
    }
  }

  return result;
}

export function computeMoodStats(comments: readonly CommentDTO[]): MoodStats {
  let positive = 0;
  let neutral = 0;
  let negative = 0;

  for (const c of comments) {
    const col = sentimentToColumn(c.sentiment);
    if (col === "POSITIVE") positive += 1;
    else if (col === "NEGATIVE") negative += 1;
    else neutral += 1;
  }

  const total = positive + neutral + negative;
  if (total === 0) {
    return {
      positive: 0,
      neutral: 0,
      negative: 0,
      total: 0,
      positivePct: 0,
      neutralPct: 0,
      negativePct: 0,
    };
  }

  // 最大余额思想保证非零时三项百分比总和恒为 100
  const positivePct = Math.round((positive / total) * 100);
  const negativePct = Math.round((negative / total) * 100);
  const neutralPct = Math.max(0, 100 - positivePct - negativePct);

  return {
    positive,
    neutral,
    negative,
    total,
    positivePct,
    neutralPct,
    negativePct,
  };
}
