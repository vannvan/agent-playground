import { Module } from '@nestjs/common';
import { CoreModule } from '../core.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { RagStore } from './rag.store';

@Module({
  imports: [CoreModule],
  controllers: [RagController],
  providers: [RagService, RagStore],
})
export class RagModule {}
