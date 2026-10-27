import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { SessionAuthGuard } from '../auth/auth.guard';
import { RewriteService } from './rewrite.service';

@UseGuards(SessionAuthGuard)
@Controller('api/rewrites')
export class RewriteController {
  constructor(private readonly rewriteService: RewriteService) {}

  @Get('authors')
  listAuthors() {
    return this.rewriteService.listAuthors();
  }

  @Get('history')
  listHistory(@Req() request: AuthenticatedRequest) {
    return this.rewriteService.listHistory(request.user.id);
  }

  @Get('search')
  searchReferences(
    @Query('q') query: string,
    @Query('author') author?: string,
    @Query('k') count?: string,
  ) {
    return this.rewriteService.searchReferences(query, author, Number(count) || 5);
  }

  @Get(':rewriteId')
  getHistoryItem(
    @Req() request: AuthenticatedRequest,
    @Param('rewriteId') rewriteId: string,
  ) {
    return this.rewriteService.getHistoryItem(request.user.id, rewriteId);
  }

  @Post('generate')
  generate(
    @Body() body: { author?: string; topic?: string; constraints?: string; targetLength?: number },
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    void this.rewriteService.generate(request.user.id, body, (content) => {
      response.write(`data: ${JSON.stringify({ content })}\n\n`);
    }).then((result) => {
      response.write(`event: done\ndata: ${JSON.stringify({
        id: result.id,
        author: result.author,
        topic: result.topic,
        model: result.model,
      })}\n\n`);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '文章生成失败';
      response.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    }).finally(() => response.end());
  }

  @Post('review')
  reviewManuscript(
    @Body() body: { draft?: string; author?: string; ignoredIssueKeys?: string[] },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewriteService.reviewManuscript(request.user.id, body);
  }

  @Post('preferences')
  savePreferenceSample(
    @Body() body: { draft?: string; polishedArticle?: string; author?: string; consent?: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewriteService.savePreferenceSample(request.user.id, body);
  }
}