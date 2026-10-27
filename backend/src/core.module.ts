import { Module } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { SessionAuthGuard } from './auth/auth.guard';
import { DatabaseService } from './database.service';
import { ModelConfigService } from './model-config.service';
import { AdminAuthService } from './admin/admin-auth.service';
import { AdminAuthGuard } from './admin/admin-auth.guard';

@Module({
  providers: [DatabaseService, AuthService, SessionAuthGuard, ModelConfigService, AdminAuthService, AdminAuthGuard],
  exports: [DatabaseService, AuthService, SessionAuthGuard, ModelConfigService, AdminAuthService, AdminAuthGuard],
})
export class CoreModule {}