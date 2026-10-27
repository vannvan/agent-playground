import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  PayloadTooLargeException,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { SessionAuthGuard } from '../auth/auth.guard';
import { RagService } from './rag.service';
import type { RagUploadFile } from './rag.schemas';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_BATCH_FILES = 100;
const MAX_BATCH_BYTES = 60 * 1024 * 1024;

@UseGuards(SessionAuthGuard)
@Controller('api/rag')
export class RagController {
  constructor(private readonly rag: RagService) {}

  @Get('documents')
  listDocuments(@Req() request: AuthenticatedRequest) {
    return this.rag.listDocuments(request.user.id);
  }

  @Post('documents')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: MAX_BATCH_FILES },
  ], { limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_BATCH_FILES } }))
  ingestDocument(
    @UploadedFiles() upload: { file?: RagUploadFile[]; files?: RagUploadFile[] } | undefined,
    @Req() request: AuthenticatedRequest,
    @Query('chunkSize') chunkSize?: string,
  ) {
    if (chunkSize !== undefined && !/^\d+$/.test(chunkSize)) throw new BadRequestException('chunkSize 必须是整数');
    const files = [...(upload?.file ?? []), ...(upload?.files ?? [])];
    if (!files.length) throw new BadRequestException('请选择 PDF、Markdown 或 TXT 文档');
    if (files.length > MAX_BATCH_FILES) throw new BadRequestException(`一次最多上传 ${MAX_BATCH_FILES} 个文件`);
    if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
      throw new PayloadTooLargeException('本次批量上传总大小不能超过 60 MB');
    }
    const chunkSizeValue = chunkSize === undefined ? undefined : Number(chunkSize);
    if (files.length === 1 && upload?.file?.length === 1) {
      return this.rag.ingest(request.user.id, files[0], chunkSizeValue);
    }
    return this.rag.ingestBatch(request.user.id, files, chunkSizeValue);
  }

  @Delete('documents/:documentId')
  deleteDocument(@Req() request: AuthenticatedRequest, @Param('documentId') documentId: string) {
    return this.rag.deleteDocument(request.user.id, documentId);
  }

  @Post('ask')
  ask(
    @Body() body: { question?: string; topK?: number; rerank?: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    if (body.rerank !== undefined && typeof body.rerank !== 'boolean') {
      throw new BadRequestException('rerank 必须是布尔值');
    }
    return this.rag.ask(request.user.id, body);
  }
}
