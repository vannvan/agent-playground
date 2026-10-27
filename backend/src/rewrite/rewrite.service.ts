import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { ParadigmPipelineService } from './paradigm-pipeline.service';

@Injectable()
export class RewriteService {
  constructor(
    private readonly database: DatabaseService,
    private readonly paradigmPipeline: ParadigmPipelineService,
  ) {}

  /** Lists authors found under the corpus root without exposing document content to the browser. */
  listAuthors() {
    return this.paradigmPipeline.listAuthors();
  }

  /** Delegates article generation to the methodology and semantic-retrieval pipeline. */
  async generate(userId: number, input: {
    author?: string;
    topic?: string;
    constraints?: string;
    targetLength?: number;
  }, onChunk?: (content: string) => void | Promise<void>) {
    return this.paradigmPipeline.write(userId, input, onChunk);
  }

  /** Runs structured humanization review using the stored methodology and semantic corpus. */
  reviewManuscript(userId: number, input: { draft?: string; author?: string; ignoredIssueKeys?: string[] }) {
    return this.paradigmPipeline.reviewManuscript(userId, input);
  }

  /** Persists an explicit-consent preference pair for future offline alignment work. */
  savePreferenceSample(userId: number, input: {
    draft?: string; polishedArticle?: string; author?: string; consent?: boolean;
  }) {
    return this.paradigmPipeline.savePreferenceSample(userId, input);
  }

  /** Returns recent rewrite summaries without transferring generated article bodies. */
  listHistory(userId: number) {
    return this.database.listUserRewrites(userId);
  }

  /** Exposes the same bounded semantic retrieval used by the writing endpoint. */
  searchReferences(query: string, author?: string, k = 5) {
    return this.paradigmPipeline.search(query, { author, k });
  }

  /** Loads a saved draft only when it belongs to the authenticated user. */
  async getHistoryItem(userId: number, rewriteId: string) {
    const item = await this.database.getUserRewrite(userId, rewriteId);
    if (!item) throw new NotFoundException('仿写记录不存在');
    return item;
  }
}