import { Module, DynamicModule, Provider } from '@nestjs/common';
import { SkillRegistry, SKILL_REGISTRY } from './skill-registry';
import { SkillRouterService } from './skill-router.service';
import type { SkillBase } from './skill-base';

/**
 * SkillsModule：
 * - 注册所有技能到 SkillRegistry（单例）
 * - 导出 SKILL_REGISTRY（供 Controller 注入）
 * - 导出 SkillRouterService（供 Controller 注入）
 *
 * 新增技能只需：
 *   1. 在 skills/ 下新建目录和 skill 类（继承 SkillBase，加 @Injectable()）
 *   2. 在 app.module.ts 的 SkillsModule.register(...) 传入该类（class，非实例）
 *   无需修改其他任何模块。
 */
@Module({})
export class SkillsModule {
  static register(skillClasses: Array<{ new (...args: any[]): SkillBase }>): DynamicModule {
    // 单一共享实例：SkillRegistry class token 与 SKILL_REGISTRY symbol token 都指向它
    const sharedRegistry = new SkillRegistry();
    const providers: Provider[] = [
      { provide: SkillRegistry, useValue: sharedRegistry },
      { provide: SKILL_REGISTRY, useValue: sharedRegistry },
      SkillRouterService,
      ...skillClasses.map((c) => ({ provide: c, useClass: c })),
      {
        // 模块初始化时把每个 skill 实例注册进共享 registry
        provide: 'SKILL_REGISTRAR',
        useFactory: (registry: SkillRegistry, ...skills: SkillBase[]) => {
          for (const skill of skills) {
            registry.register(skill);
          }
          return registry;
        },
        inject: [SKILL_REGISTRY, ...skillClasses],
      },
    ];
    return {
      module: SkillsModule,
      providers,
      exports: [SKILL_REGISTRY, SkillRouterService],
    };
  }
}
