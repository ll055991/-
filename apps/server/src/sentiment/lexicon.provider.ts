import type { ResolvedSentiment, SentimentProvider } from "./provider.js";

// 正面词典（含职场与产品体验常见正向表达）
const POSITIVE_TERMS: readonly [string, number][] = [
  ["点赞", 2.0],
  ["表扬", 2.0],
  ["感谢", 1.8],
  ["太赞", 2.2],
  ["很赞", 2.0],
  ["太有用", 2.0],
  ["非常有用", 2.0],
  ["实用", 1.6],
  ["极大提升", 2.2],
  ["提升了", 1.5],
  ["提升", 1.2],
  ["效率高", 2.0],
  ["高效", 1.8],
  ["丝滑", 1.8],
  ["清晰", 1.5],
  ["透明", 1.6],
  ["方便", 1.5],
  ["流畅", 1.6],
  ["满意", 1.8],
  ["开心", 1.8],
  ["喜欢", 1.6],
  ["优秀", 2.0],
  ["靠谱", 1.8],
  ["给力", 1.8],
  ["认可", 1.6],
  ["重视", 1.3],
  ["全公司推广", 2.0],
  ["值得推广", 2.0],
  ["更有底气", 2.0],
  ["幸福感", 2.2],
  ["速度快", 1.6],
  ["速度简化", 1.5],
  ["缩短了一半", 1.8],
  ["好转", 1.4],
  ["不错", 1.5],
  ["挺好", 1.5],
  ["很好", 1.8],
  ["非常棒", 2.2],
  ["太棒", 2.2],
];

// 负面词典（含职场常见吐槽、低效、内耗与环境压力表达）
const NEGATIVE_TERMS: readonly [string, number][] = [
  ["吐槽", 1.8],
  ["卡顿", 2.0],
  ["崩溃", 2.2],
  ["恶心", 2.2],
  ["糟糕", 2.0],
  ["太差", 2.2],
  ["很差", 2.0],
  ["垃圾", 2.4],
  ["加班", 1.8],
  ["摸鱼", 1.4],
  ["内耗", 2.2],
  ["扯皮", 2.2],
  ["自证清白", 2.4],
  ["沟通成本高", 2.2],
  ["沟通成本很高", 2.4],
  ["流于形式", 2.0],
  ["敷衍", 2.0],
  ["拖沓", 1.8],
  ["低效", 2.0],
  ["消耗", 1.6],
  ["浪费", 1.8],
  ["折腾", 1.8],
  ["头疼", 1.8],
  ["难推", 2.0],
  ["越来越难", 2.2],
  ["拥挤", 1.6],
  ["紧凑", 1.2],
  ["憋闷", 1.8],
  ["犯困", 1.5],
  ["离职", 2.0],
  ["流失", 1.8],
  ["缺乏", 1.5],
  ["留不住", 2.0],
  ["压抑", 2.0],
  ["焦虑", 1.8],
  ["痛苦", 2.0],
  ["失望", 2.0],
  ["不满", 2.0],
  ["混乱", 1.8],
  ["繁琐", 1.8],
  ["麻烦", 1.5],
  ["画饼", 2.2],
  ["表演性加班", 2.5],
  ["不好意思", 1.0],
  ["不合理", 2.0],
  ["太慢", 1.8],
  ["报错", 1.6],
];

// 程度副词（出现在情感词前 4 个字符窗口内时放大或缩小极性权重）
const INTENSIFIERS: readonly [string, number][] = [
  ["非常", 1.5],
  ["特别", 1.5],
  ["极其", 1.7],
  ["严重", 1.6],
  ["实在", 1.4],
  ["十分", 1.5],
  ["明显", 1.3],
  ["太", 1.35],
  ["很", 1.25],
  ["有点", 0.7],
  ["稍微", 0.65],
  ["略微", 0.65],
];

// 否定词（前向窗口内翻转情感极性，排除“不错”“不仅”等伪否定搭配）
const NEGATIONS = ["不是", "没有", "并非", "不够", "难以", "很难", "不太", "不", "没"];
const FALSE_NEGATIONS = ["不错", "不仅", "不愧", "不赖", "不止"];

function computeTermWeight(text: string, index: number, baseScore: number): number {
  const windowStart = Math.max(0, index - 4);
  const prefix = text.slice(windowStart, index);

  let multiplier = 1;
  for (const [adv, weight] of INTENSIFIERS) {
    if (prefix.includes(adv)) {
      multiplier = weight;
      break;
    }
  }

  let negated = false;
  const localSpan = text.slice(Math.max(0, index - 2), index + 2);
  const isFalseNeg = FALSE_NEGATIONS.some((fn) => localSpan.includes(fn));
  if (!isFalseNeg) {
    for (const neg of NEGATIONS) {
      if (prefix.endsWith(neg) || prefix.includes(neg)) {
        negated = true;
        break;
      }
    }
  }

  return baseScore * multiplier * (negated ? -0.8 : 1);
}

// 本地零依赖中文情绪打分引擎：作为无 LLM_API_KEY 或大模型超时/异常时的兜底方案
export function analyzeWithLexicon(text: string): ResolvedSentiment {
  const normalized = text.trim();
  if (!normalized) return "NEUTRAL";

  let score = 0;

  for (const [term, weight] of POSITIVE_TERMS) {
    let pos = normalized.indexOf(term);
    while (pos !== -1) {
      score += computeTermWeight(normalized, pos, weight);
      pos = normalized.indexOf(term, pos + term.length);
    }
  }

  for (const [term, weight] of NEGATIVE_TERMS) {
    let pos = normalized.indexOf(term);
    while (pos !== -1) {
      score -= computeTermWeight(normalized, pos, weight);
      pos = normalized.indexOf(term, pos + term.length);
    }
  }

  // 设温和中性区间 [-0.9, 0.9]，中性客观陈述或正负抵消的建议归为 NEUTRAL
  if (score >= 0.9) return "POSITIVE";
  if (score <= -0.9) return "NEGATIVE";
  return "NEUTRAL";
}

export class LexiconSentimentProvider implements SentimentProvider {
  readonly name = "lexicon" as const;

  async analyze(text: string): Promise<ResolvedSentiment> {
    return analyzeWithLexicon(text);
  }
}
