import type { CommentSentimentDTO } from "@wall/shared";
import { config } from "../config.js";
import { commentRepository } from "../repositories/comment.repository.js";
import { LexiconSentimentProvider } from "./lexicon.provider.js";
import { LlmSentimentProvider } from "./llm.provider.js";
import type { ResolvedSentiment, SentimentProvider } from "./provider.js";

interface SentimentTask {
  commentId: string;
  content: string;
}

type SentimentBroadcaster = (payload: CommentSentimentDTO) => void;

const MAX_CONCURRENCY = 3;

// 异步情绪分析服务：内存队列（并发≤3）+ 同评论防抖覆盖 + LLM/词典策略降级链
export class SentimentService {
  private readonly llmProvider: SentimentProvider | null;
  private readonly fallbackProvider = new LexiconSentimentProvider();
  private readonly pendingByComment = new Map<string, SentimentTask>();
  private readonly queue: string[] = [];
  private activeCount = 0;
  private broadcaster: SentimentBroadcaster | null = null;

  constructor() {
    const apiKey = config.LLM_API_KEY?.trim();
    this.llmProvider = apiKey
      ? new LlmSentimentProvider({
          apiKey,
          baseUrl: config.LLM_BASE_URL,
          model: config.LLM_MODEL,
        })
      : null;
  }

  setBroadcaster(fn: SentimentBroadcaster) {
    this.broadcaster = fn;
  }

  // 同一条评论短时间内多次编辑时，直接覆盖队列中的待分析文本，避免无意义重复调用
  enqueue(commentId: string, content: string) {
    const alreadyQueued = this.pendingByComment.has(commentId);
    this.pendingByComment.set(commentId, { commentId, content });
    if (!alreadyQueued) {
      this.queue.push(commentId);
    }
    this.drain();
  }

  private drain() {
    while (this.activeCount < MAX_CONCURRENCY && this.queue.length > 0) {
      const commentId = this.queue.shift()!;
      const task = this.pendingByComment.get(commentId);
      if (!task) continue;
      this.pendingByComment.delete(commentId);

      this.activeCount += 1;
      void this.runTask(task).finally(() => {
        this.activeCount -= 1;
        this.drain();
      });
    }
  }

  async classify(text: string): Promise<{ sentiment: ResolvedSentiment; by: "llm" | "lexicon" }> {
    if (this.llmProvider) {
      try {
        const sentiment = await this.llmProvider.analyze(text);
        return { sentiment, by: "llm" };
      } catch {
        // LLM 超时、网络异常或非法输出时静默降级到本地词典引擎，保障功能始终可用
      }
    }
    const sentiment = await this.fallbackProvider.analyze(text);
    return { sentiment, by: "lexicon" };
  }

  private async runTask(task: SentimentTask) {
    try {
      const { sentiment, by } = await this.classify(task.content);
      // 落库前校验评论未删除且内容未在分析途中再次被修改，避免过期分析结果覆盖新内容
      const updated = await commentRepository.updateSentimentIfContentMatches(
        task.commentId,
        task.content,
        sentiment,
        by,
      );
      if (!updated) return;

      this.broadcaster?.({
        id: updated.id,
        sentiment: updated.sentiment,
        version: updated.version,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch {
      // 异步后台任务吞掉非致命异常，绝不影响主进程稳定性
    }
  }
}

export const sentimentService = new SentimentService();
