export type ResolvedSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

// 策略模式接口：方便未来无缝替换或新增不同情绪识别引擎，业务代码零侵入
export interface SentimentProvider {
  readonly name: "llm" | "lexicon";
  analyze(text: string): Promise<ResolvedSentiment>;
}
