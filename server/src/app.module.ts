import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AdminController } from './admin/admin.controller';
import { AdminAuthController } from './admin/admin-auth.controller';
import { AuthController } from './auth/auth.controller';
import { WorkspaceController } from './workspace.controller';
import { CoreModule } from './core.module';
import { RewriteModule } from './rewrite/rewrite.module';
import { RagModule } from './rag/rag.module';
import { AiEngineModule } from './ai-engine/ai-engine.module';
import { SkillsModule } from './skills/skills.module';
import { KnowledgeBaseSkill } from './skills/knowledge-base/knowledge-base.skill';

@Module({
  imports: [
    CoreModule,
    RewriteModule,
    RagModule,
    AiEngineModule,
    SkillsModule.register([KnowledgeBaseSkill]),
  ],
  controllers: [AppController, AdminController, AdminAuthController, AuthController, WorkspaceController],
  providers: [],
})
export class AppModule {}
