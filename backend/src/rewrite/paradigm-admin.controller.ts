import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { ParadigmPipelineService } from './paradigm-pipeline.service';

/** Administrative endpoints for corpus extraction and vector-index maintenance. */
@UseGuards(AdminAuthGuard)
@Controller('api/admin/paradigm')
export class ParadigmAdminController {
  constructor(private readonly pipeline: ParadigmPipelineService) {}

  @Get('documents')
  listDocuments() {
    return this.pipeline.listDocuments();
  }

  @Get('status')
  getStatus() {
    return this.pipeline.getMethodologyStatus();
  }

  @Get('results')
  getExtractedResults() {
    return this.pipeline.getExtractedResults();
  }

  @Post('extract')
  extractAndReduce() {
    return this.pipeline.extractAndReduce();
  }

  @Post('index')
  buildVectorIndex() {
    return this.pipeline.buildVectorIndex();
  }
}