import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { RagChunk, RagDocument } from './rag.schemas';

type UserRagIndex = { version: 1; userId: number; documents: RagDocument[]; chunks: RagChunk[] };

@Injectable()
export class RagStore {
  private get root() {
    return resolve(process.env.RAG_DATA_DIR?.trim() || join(process.cwd(), '.rag-data'));
  }

  private indexPath(userId: number) {
    return join(this.root, String(userId), 'index.json');
  }

  /** Loads only the authenticated user's private RAG index. */
  async load(userId: number): Promise<UserRagIndex> {
    try {
      const index = JSON.parse(await readFile(this.indexPath(userId), 'utf8')) as UserRagIndex;
      if (index.version !== 1 || index.userId !== userId || !Array.isArray(index.documents) || !Array.isArray(index.chunks)) {
        throw new Error('RAG index schema mismatch');
      }
      return index;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, userId, documents: [], chunks: [] };
      throw new ServiceUnavailableException('知识库索引损坏，请重新上传文档');
    }
  }

  /** Atomically persists one user's independent document metadata and vectors. */
  async save(index: UserRagIndex) {
    const path = this.indexPath(index.userId);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(index)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  }
}
