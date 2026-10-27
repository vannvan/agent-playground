import { z } from 'zod';

export const QueryRewriteSchema = z.object({
  queries: z.array(z.string()).min(1).max(3),
});

export const GroundingCheckSchema = z.object({
  isGrounded: z.boolean(),
  copiesSourceVerbatim: z.boolean(),
  safeAnswer: z.string().describe('仅保留能由参考资料支持、并已避免大段照抄的回答；不能安全作答时为空字符串'),
});

export type RagCitation = {
  chunkId: string;
  documentId: string;
  documentName: string;
  section: string;
  page?: number;
};

export type RagUploadFile = { originalname: string; size: number; buffer: Buffer };

export type RagChunk = Omit<RagCitation, 'chunkId'> & {
  id: string;
  userId: number;
  text: string;
  vector: number[];
  documentHash: string;
};

export type RagDocument = {
  id: string;
  userId: number;
  name: string;
  type: 'pdf' | 'md' | 'txt';
  size: number;
  chunkSize: number;
  chunkCount: number;
  createdAt: string;
};

export type RagAnswer = {
  answer: string;
  sources: RagCitation[];
  rewrittenQueries: string[];
  reranked: boolean;
};
