import { describe, expect, it } from "vitest";
import { analyzeWithLexicon } from "../lexicon.provider.js";

describe("analyzeWithLexicon 中文情绪词典引擎", () => {
  it("识别正面表扬类评论", () => {
    expect(
      analyzeWithLexicon("表扬这次新上线的报销系统，流程清晰高效，建议全公司推广！"),
    ).toBe("POSITIVE");
    expect(analyzeWithLexicon("休息区增设的静音舱非常有用，极大提升了幸福感。")).toBe(
      "POSITIVE",
    );
  });

  it("识别负面职场吐槽类评论", () => {
    expect(
      analyzeWithLexicon("目前业务侧和技术侧沟通成本很高，每次都在自证清白，严重内耗。"),
    ).toBe("NEGATIVE");
    expect(analyzeWithLexicon("最近天天表演性加班，系统还一直卡顿崩溃，太糟糕了。")).toBe(
      "NEGATIVE",
    );
  });

  it("识别中性客观陈述", () => {
    expect(analyzeWithLexicon("周三下午三点在三楼会议室同步下季度排期。")).toBe("NEUTRAL");
    expect(analyzeWithLexicon("   ")).toBe("NEUTRAL");
  });

  it("支持前向否定词翻转与伪否定豁免", () => {
    expect(analyzeWithLexicon("这套新流程并不高效，也不方便")).toBe("NEGATIVE");
    expect(analyzeWithLexicon("这次改进挺不错，非常满意")).toBe("POSITIVE");
  });
});
