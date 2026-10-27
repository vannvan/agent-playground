import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ArticleFeature, PreferenceSample, WritingMethodology } from './paradigm.schemas';

export type ParadigmCheckpoint = {
  version: 1;
  updatedAt: string;
  articles: Record<string, { sourceHash: string; feature: ArticleFeature }>;
  methodologies: Record<string, WritingMethodology>;
  methodologySourceHashes: Record<string, string>;
};

export type StoredChunk = {
  id: string;
  documentId: string;
  sourceHash: string;
  author: string;
  source: string;
  text: string;
  vector: number[];
};

type VectorIndex = { version: 1; model: string; providerHash: string; documentHashes: Record<string, string>; chunks: StoredChunk[] };

@Injectable()
export class ParadigmStore {
  /** Stores extraction checkpoints and the compact local vector index outside source files. */
  private get dataDirectory() {
    return resolve(process.env.PARADIGM_DATA_DIR?.trim() || join(process.cwd(), '.paradigm-data'));
  }

  private get checkpointPath() {
    return join(this.dataDirectory, 'checkpoint.json');
  }

  private get vectorPath() {
    return join(this.dataDirectory, 'vectors.json');
  }

  private get preferenceSamplesPath() {
    return join(this.dataDirectory, 'preference-samples.jsonl');
  }

  /** Reads resumable Map results, starting with an empty versioned checkpoint when absent. */
  async loadCheckpoint(): Promise<ParadigmCheckpoint> {
    try {
      const data = JSON.parse(await readFile(this.checkpointPath, 'utf8')) as ParadigmCheckpoint;
      if (data.version !== 1 || !data.articles || !data.methodologies) throw new Error('checkpoint version mismatch');
      data.methodologySourceHashes ??= {};
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, updatedAt: new Date().toISOString(), articles: {}, methodologies: {}, methodologySourceHashes: {} };
      }
      throw new ServiceUnavailableException('范式萃取断点文件无效，请检查 .paradigm-data/checkpoint.json');
    }
  }

  /** Atomically persists a checkpoint after every processed article or author. */
  async saveCheckpoint(checkpoint: ParadigmCheckpoint) {
    checkpoint.updatedAt = new Date().toISOString();
    await this.writeJson(this.checkpointPath, checkpoint);
  }

  /** Persists local embeddings and source chunks without requiring a hosted vector database. */
  async saveVectorIndex(index: VectorIndex) {
    await this.writeJson(this.vectorPath, index);
  }

  /** Loads the local vector index used for nearest-neighbor retrieval. */
  async loadVectorIndex(): Promise<VectorIndex | null> {
    try {
      const index = JSON.parse(await readFile(this.vectorPath, 'utf8')) as VectorIndex;
      return index.version === 1 && Array.isArray(index.chunks) ? index : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new ServiceUnavailableException('本地向量索引损坏，请重新构建索引');
    }
  }

  /** Appends a consented draft/preferred pair for future offline DPO/LoRA dataset preparation. */
  async appendPreferenceSample(sample: PreferenceSample) {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    await appendFile(this.preferenceSamplesPath, `${JSON.stringify(sample)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  private async writeJson(path: string, value: unknown) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  }
}
