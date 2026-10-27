import { InternalServerErrorException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { DatabaseService, StoredModelConfig } from './database.service';
import { ModelConfigService } from './model-config.service';

describe('ModelConfigService', () => {
  const previousEncryptionKey = process.env.MODEL_CONFIG_ENCRYPTION_KEY;
  let stored: StoredModelConfig | null;
  let service: ModelConfigService;

  beforeEach(() => {
    process.env.MODEL_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    stored = null;
    const database = {
      getStoredModelConfig: jest.fn(async () => stored),
      saveStoredModelConfig: jest.fn(async (_userId: number, config: Omit<StoredModelConfig, 'updatedAt'>) => {
        stored = { ...config, updatedAt: new Date() };
      }),
    } as unknown as DatabaseService;
    service = new ModelConfigService(database);
  });

  afterAll(() => {
    if (previousEncryptionKey === undefined) delete process.env.MODEL_CONFIG_ENCRYPTION_KEY;
    else process.env.MODEL_CONFIG_ENCRYPTION_KEY = previousEncryptionKey;
  });

  it('encrypts API keys at rest and can decrypt them for server requests', async () => {
    const publicConfig = await service.save(42, {
      apiKey: 'secret-api-key-value',
      baseUrl: 'https://api.example.com/v1',
      textModel: 'chat-model',
      imageModel: 'image-model',
      videoModel: 'video-model',
    });

    expect(stored?.apiKeyCiphertext).not.toContain('secret-api-key-value');
    expect(publicConfig).not.toHaveProperty('apiKey');
    expect(publicConfig.hasApiKey).toBe(true);
    await expect(service.getPrivateConfig(42)).resolves.toMatchObject({
      apiKey: 'secret-api-key-value',
      textModel: 'chat-model',
      imageModel: 'image-model',
      videoModel: 'video-model',
    });
  });

  it('rejects modified ciphertext', async () => {
    await service.save(42, {
      apiKey: 'secret-api-key-value',
      baseUrl: 'https://api.example.com/v1',
      textModel: 'chat-model',
    });
    if (stored) stored.apiKeyCiphertext = Buffer.from('tampered').toString('base64');

    await expect(service.getPrivateConfig(42)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('tests the supplied unsaved text-model settings without exposing credentials', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await expect(service.testConnection(42, {
      apiKey: 'temporary-secret',
      baseUrl: 'https://api.example.com/v1',
      textModel: 'custom-model',
    })).resolves.toMatchObject({ success: true, message: '文本模型连接成功' });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer temporary-secret' }),
    }));
    fetchSpy.mockRestore();
  });

  it('does not return upstream error details from a failed connection test', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret provider payload', { status: 401 }));
    const result = await service.testConnection(42, {
      apiKey: 'temporary-secret',
      baseUrl: 'https://api.example.com/v1',
      textModel: 'custom-model',
    });
    expect(result).toMatchObject({ success: false, message: '连接失败：API Key 无效或没有访问权限' });
    expect(JSON.stringify(result)).not.toContain('secret');
    fetchSpy.mockRestore();
  });
});
