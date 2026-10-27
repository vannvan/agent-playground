import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AdminController } from './admin/admin.controller';
import { AdminAuthController } from './admin/admin-auth.controller';
import { AuthController } from './auth/auth.controller';
import { WorkspaceController } from './workspace.controller';
import { CoreModule } from './core.module';
import { RewriteModule } from './rewrite/rewrite.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [CoreModule, RewriteModule, RagModule],
  controllers: [AppController, AdminController, AdminAuthController, AuthController, WorkspaceController],
  providers: [],
})
export class AppModule {}
