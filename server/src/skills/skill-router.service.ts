import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { SkillRegistry, SKILL_REGISTRY } from './skill-registry';
import type { SkillBase } from './skill-base';

/**
 * 根据 skillId 将请求路由到对应技能。
 * 未指定 skillId 时返回 undefined，由调用方走默认 LLM 路径。
 */
@Injectable()
export class SkillRouterService {
  private readonly logger = new Logger(SkillRouterService.name);

  constructor(@Inject(SKILL_REGISTRY) private readonly registry: SkillRegistry) {}

  getSkill(skillId: string): SkillBase | undefined {
    const skill = this.registry.get(skillId);
    if (!skill) {
      this.logger.warn(`未注册的技能 ID: ${skillId}`);
    }
    return skill;
  }
}
