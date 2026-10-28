import { Module, DynamicModule } from '@nestjs/common';
import { SkillRegistry, SKILL_REGISTRY } from './skill-registry';
import { SkillRouterService } from './skill-router.service';
import { KnowledgeBaseSkill } from './knowledge-base/knowledge-base.skill';

/**
 * SkillsModule：
 * - 注册所有技能到 SkillRegistry（单例）
 * - 导出 SkillRegistry（供 Controller 注入）
 * - 导出 SkillRouterService（供 Controller 注入）
 *
 * 新增技能只需：
 *   1. 在 skills/ 下新建目录和 skill 类（继承 SkillBase）
 *   2. 在此处的 providers 数组加入该类
 *   无需修改其他任何模块。
 */
@Module({})
export class SkillsModule {
  static register(...skills: unknown[]): DynamicModule {
    return {
      module: SkillsModule,
      providers: [
        SkillRegistry,
        SkillRouterService,
        // 将所有技能实例注入 registry，由 onModuleInit 自动注册
        ...skills,
        {
          provide: 'SKILL_REGISTRAR',
          useFactory: (registry: SkillRegistry, ...skillInstances: SkillBase[]) => {
            for (const skill of skillInstances) {
              registry.register(skill);
            }
            return registry;
          },
          inject: [SKILL_REGISTRY, ...skills],
        },
      ],
      exports: [SkillRegistry, SkillRouterService],
    };
  }
}
