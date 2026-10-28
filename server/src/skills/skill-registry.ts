import type { SkillBase } from './skill-base';

/** 全局技能注册表，NestJS 启动时由 SkillsModule 填充 */
export class SkillRegistry {
  private readonly map = new Map<string, SkillBase>();

  register(skill: SkillBase): void {
    if (this.map.has(skill.id)) {
      throw new Error(`Skill '${skill.id}' is already registered`);
    }
    this.map.set(skill.id, skill);
  }

  get(id: string): SkillBase | undefined {
    return this.map.get(id);
  }

  getAll(): SkillBase[] {
    return [...this.map.values()];
  }
}

/** NestJS 单例 token，可在任意模块注入 */
export const SKILL_REGISTRY = Symbol('SKILL_REGISTRY');
