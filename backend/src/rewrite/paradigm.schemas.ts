import { z } from 'zod';

export const ArticleFeatureSchema = z.object({
  title: z.string().describe('文章标题或推断主题'),
  structure: z.array(z.object({
    stage: z.string().describe('结构阶段名称'),
    purpose: z.string().describe('该阶段的写作目的'),
    keyPoints: z.array(z.string()).describe('该阶段承载的要点'),
  })).describe('文章宏观结构'),
  opening: z.object({
    pattern: z.string().describe('开篇方式，例如场景、设问、观点、故事'),
    technique: z.string().describe('如何建立兴趣并引入主题'),
  }),
  paragraphLogic: z.array(z.string()).describe('段落推进和内部组织逻辑'),
  transitions: z.array(z.string()).describe('段落或章节间的过渡方式'),
  argumentation: z.array(z.string()).describe('论证策略及材料组织方式'),
  ending: z.object({
    pattern: z.string().describe('结尾范式'),
    effect: z.string().describe('结尾产生的阅读效果'),
  }),
  style: z.object({
    tone: z.array(z.string()),
    sentenceRhythm: z.string(),
    diction: z.array(z.string()),
    rhetoricalDevices: z.array(z.string()),
  }),
  aiTemplateFeatures: z.array(z.string()).describe('文章中应避免的模板化表达、过度工整或常见 AI 套话特征'),
  humanExpressionPreferences: z.array(z.string()).describe('范文体现的真人表达偏好，例如语气、节奏、具体性和不规则感'),
  pitfalls: z.array(z.string()).describe('从本文风格可归纳的写作避坑点'),
});

export type ArticleFeature = z.infer<typeof ArticleFeatureSchema>;

export const WritingMethodologySchema = z.object({
  title: z.string(),
  commonPatterns: z.array(z.string()).describe('跨文章反复出现的共性方法'),
  exceptions: z.array(z.object({
    pattern: z.string(),
    appliesWhen: z.string(),
  })).describe('仅适用于特定题材或文章的特例'),
  outline: z.array(z.object({
    stage: z.string(),
    purpose: z.string(),
    instructions: z.array(z.string()),
  })),
  openingRules: z.array(z.string()),
  paragraphRules: z.array(z.string()),
  transitionRules: z.array(z.string()),
  argumentationRules: z.array(z.string()),
  endingRules: z.array(z.string()),
  styleGuide: z.object({
    tone: z.array(z.string()),
    sentenceRhythm: z.array(z.string()),
    diction: z.array(z.string()),
    rhetoric: z.array(z.string()),
  }),
  aiTemplateBlacklist: z.array(z.string()).describe('明确应避免的 AI 模板痕迹、套话和工整套路'),
  humanExpressionPreferences: z.array(z.string()).describe('应优先保留或模仿的自然、具体、有人味的表达偏好'),
  prohibitedPatterns: z.array(z.string()),
  selfCheck: z.array(z.string()),
});

export type WritingMethodology = z.infer<typeof WritingMethodologySchema>;

export const ManuscriptReviewSchema = z.object({
  issues: z.array(z.object({
    severity: z.enum(['severe', 'moderate', 'polish']).describe('问题严重程度：严重、中等、可优化'),
    paragraphIndex: z.number().int().positive().describe('原稿的段落序号，从 1 开始'),
    lineNumber: z.number().int().positive().describe('原稿中的近似行号，从 1 开始'),
    originalText: z.string().describe('原稿中逐字出现、可精确定位的最短问题片段，不得改写'),
    replacementText: z.string().describe('保持原意和论点不变的建议替换文本'),
    issue: z.string().describe('一句话指出这里为什么有 AI 味'),
    rationale: z.string().describe('简要说明问题特征和调整依据'),
  })),
});

export type ManuscriptReview = z.infer<typeof ManuscriptReviewSchema>;

export type PreferenceSample = {
  id: string;
  userId: number;
  createdAt: string;
  author: string | null;
  draft: string;
  polishedArticle: string;
};
