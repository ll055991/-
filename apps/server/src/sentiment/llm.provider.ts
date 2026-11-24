import type { ResolvedSentiment, SentimentProvider } from "./provider.js";

interface LlmProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

const VALID_SENTIMENTS = new Set<ResolvedSentiment>(["POSITIVE", "NEUTRAL", "NEGATIVE"]);

// OpenAI 兼容协议情绪分类器：严格超时控制 + JSON 解析，异常时由上层自动降级到本地词典引擎
export class LlmSentimentProvider implements SentimentProvider {
  readonly name = "llm" as const;
  private readonly timeoutMs: number;

  constructor(private readonly opts: LlmProviderOptions) {
    this.timeoutMs = opts.timeoutMs ?? 3000;
  }

  async analyze(text: string): Promise<ResolvedSentiment> {
    const endpoint = `${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              '你是职场意见墙情绪分类器。请判断用户评论的整体情绪，仅输出 JSON：{"sentiment":"POSITIVE"|"NEUTRAL"|"NEGATIVE"}。POSITIVE 为表扬/肯定/满意，NEGATIVE 为吐槽/不满/抱怨，NEUTRAL 为客观陈述或平和建议。',
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("LLM empty response");

    const parsed = JSON.parse(raw) as { sentiment?: string };
    const value = parsed.sentiment?.toUpperCase() as ResolvedSentiment | undefined;
    if (!value || !VALID_SENTIMENTS.has(value)) {
      throw new Error(`LLM invalid sentiment: ${String(parsed.sentiment)}`);
    }
    return value;
  }
}
