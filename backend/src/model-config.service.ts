import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseService, StoredModelConfig } from './database.service';

export type PrivateModelConfig = {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
};

@Injectable()
export class ModelConfigService {
  constructor(private readonly database: DatabaseService) {}

  async getPublicConfig(userId: number) {
    const stored = await this.database.getStoredModelConfig(userId);
    return {
      baseUrl: stored?.baseUrl ?? '',
      textModel: stored?.textModel ?? '',
      imageModel: stored?.imageModel ?? '',
      videoModel: stored?.videoModel ?? '',
      hasApiKey: Boolean(stored),
      maskedApiKey: stored ? this.mask(this.decrypt(stored)) : '',
      updatedAt: stored?.updatedAt ?? null,
    };
  }

  async save(userId: number, input: {
    apiKey?: string;
    baseUrl?: string;
    textModel?: string;
    model?: string;
    imageModel?: string;
    videoModel?: string;
  }) {
    const baseUrl = input.baseUrl?.trim() ?? '';
    const textModel = input.textModel?.trim() || input.model?.trim() || '';
    const imageModel = input.imageModel?.trim() ?? '';
    const videoModel = input.videoModel?.trim() ?? '';
    this.validateBaseUrl(baseUrl);
    this.validateModelName(textModel, '文本');
    this.validateOptionalModelName(imageModel, '图像');
    this.validateOptionalModelName(videoModel, '视频');

    const existing = await this.database.getStoredModelConfig(userId);
    const apiKey = input.apiKey?.trim() || (existing ? this.decrypt(existing) : '');
    if (!apiKey) throw new BadRequestException('请先填写 API Key');
    if (apiKey.length > 4096) throw new BadRequestException('API Key 长度无效');

    const encrypted = this.encrypt(apiKey);
    await this.database.saveStoredModelConfig(userId, {
      baseUrl,
      textModel,
      imageModel: imageModel || null,
      videoModel: videoModel || null,
      ...encrypted,
    });
    return this.getPublicConfig(userId);
  }

  async getPrivateConfig(userId: number): Promise<PrivateModelConfig> {
    const stored = await this.database.getStoredModelConfig(userId);
    if (!stored) throw new BadRequestException('请先在模型配置中设置 API Key、接口地址和模型名称');
    const config: PrivateModelConfig = {
      apiKey: this.decrypt(stored),
      baseUrl: stored.baseUrl,
      textModel: stored.textModel,
      imageModel: stored.imageModel ?? '',
      videoModel: stored.videoModel ?? '',
    };
    if (!config.apiKey || !config.baseUrl || !config.textModel) throw new BadRequestException('请先在模型配置中设置 API Key、接口地址和文本模型');
    this.validateBaseUrl(config.baseUrl);
    return config;
  }

  /** Uses an explicitly configured user model for protected offline corpus jobs. */
  async getPrivateConfigForAdminPipeline(): Promise<PrivateModelConfig> {
    const userId = Number(process.env.PARADIGM_MODEL_CONFIG_USER_ID);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new BadRequestException('后台范式任务未配置 PARADIGM_MODEL_CONFIG_USER_ID');
    }
    return this.getPrivateConfig(userId);
  }

  async testConnection(userId: number, input: {
    apiKey?: string;
    baseUrl?: string;
    textModel?: string;
    model?: string;
  }) {
    const startedAt = Date.now();
    const stored = await this.database.getStoredModelConfig(userId);
    const apiKey = input.apiKey?.trim() || (stored ? this.decrypt(stored) : '');
    const baseUrl = input.baseUrl?.trim() || stored?.baseUrl || '';
    const textModel = input.textModel?.trim() || input.model?.trim() || stored?.textModel || '';
    if (!apiKey) throw new BadRequestException('请先填写 API Key');
    if (apiKey.length > 4096) throw new BadRequestException('API Key 长度无效');
    this.validateBaseUrl(baseUrl);
    this.validateModelName(textModel, '文本');

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: textModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        const message = response.status === 401 || response.status === 403
          ? '连接失败：API Key 无效或没有访问权限'
          : response.status === 404
            ? '连接失败：接口地址或文本模型不存在'
            : response.status === 429
              ? '连接成功，但服务商限流或额度不足'
              : response.status >= 500
                ? '连接失败：模型服务暂时不可用'
                : `连接失败：服务商返回 HTTP ${response.status}`;
        return { success: false, durationMs: Date.now() - startedAt, message };
      }
      return { success: true, durationMs: Date.now() - startedAt, message: '文本模型连接成功' };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return {
        success: false,
        durationMs: Date.now() - startedAt,
        message: timedOut ? '连接超时，请检查接口地址或稍后重试' : '无法连接模型服务，请检查网络和接口地址',
      };
    }
  }

  private validateModelName(value: string, type: string) {
    if (!value || value.length > 255) throw new BadRequestException(`请填写有效的${type}模型名称`);
  }

  private validateOptionalModelName(value: string, type: string) {
    if (value.length > 255) throw new BadRequestException(`${type}模型名称过长`);
  }

  private validateBaseUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('请输入有效的模型接口地址');
    }
    const host = url.hostname.toLowerCase();
    const blockedHost = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host === '::1' || host === '0.0.0.0' || host.startsWith('127.') || host.startsWith('10.') ||
      host.startsWith('192.168.') || host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (blockedHost || url.username || url.password || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      throw new BadRequestException('模型接口地址必须是安全的 HTTPS 公网地址');
    }
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new BadRequestException('模型接口仅支持 HTTP 或 HTTPS');
    }
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      apiKeyCiphertext: ciphertext.toString('base64'),
      apiKeyIv: iv.toString('base64'),
      apiKeyTag: cipher.getAuthTag().toString('base64'),
    };
  }

  private decrypt(value: StoredModelConfig) {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getEncryptionKey(),
        Buffer.from(value.apiKeyIv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(value.apiKeyTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(value.apiKeyCiphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('模型密钥解密失败，请检查加密密钥配置');
    }
  }

  private getEncryptionKey() {
    const encoded = process.env.MODEL_CONFIG_ENCRYPTION_KEY;
    if (!encoded) throw new InternalServerErrorException('服务端未配置模型密钥加密密钥');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException('MODEL_CONFIG_ENCRYPTION_KEY 必须是 32 字节的 Base64 值');
    }
    return key;
  }

  private mask(value: string) {
    return value.length < 10 ? '••••••••' : `${value.slice(0, 4)}••••••${value.slice(-4)}`;
  }
}
