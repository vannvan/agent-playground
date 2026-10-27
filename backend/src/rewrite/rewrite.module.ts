import { Module } from '@nestjs/common';
import { CoreModule } from '../core.module';
import { RewriteController } from './rewrite.controller';
import { RewriteService } from './rewrite.service';
import { ParadigmStore } from './paradigm.store';
import { ParadigmPipelineService } from './paradigm-pipeline.service';
import { ParadigmAdminController } from './paradigm-admin.controller';

@Module({
  imports: [CoreModule],
  controllers: [RewriteController, ParadigmAdminController],
  providers: [RewriteService, ParadigmStore, ParadigmPipelineService],
})
export class RewriteModule {}