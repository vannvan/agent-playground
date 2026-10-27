import { AppController, validateImageSize } from './app.controller';
import { ChatOpenAI } from '@langchain/openai';
import { jest } from '@jest/globals';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(() => {
    appController = new AppController({
      getUserChat: jest.fn(async () => ({ messages: [] })),
      appendUserChatExchange: jest.fn(async () => undefined),
      recordUserGenerationRequest: jest.fn(async () => undefined),
    } as never, {
      getPrivateConfig: jest.fn(async () => ({
        apiKey: 'test-key',
        baseUrl: 'https://relay.example.com/v1',
        textModel: 'custom-text-model',
        imageModel: 'custom-image-model',
        videoModel: 'custom-video-model',
      })),
    } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('accepts supported image dimensions and defaults to square', () => {
    expect(validateImageSize('1536x1024')).toBe('1536x1024');
    expect(validateImageSize()).toBe('1024x1024');
  });

  it('rejects image dimensions outside the supported preset list', () => {
    expect(() => validateImageSize('2048x2048')).toThrow('不支持的图片尺寸');
  });

  it('uses the saved user model and streams model content', async () => {
    jest.spyOn(ChatOpenAI.prototype, 'stream').mockResolvedValue((async function* () {
      yield { content: '中转' } as never;
      yield { content: '成功' } as never;
    })() as never);
    const chunks: string[] = [];

    await appController.chat(
      { message: '测试', chatId: 'chat-id' },
      createResponse((value) => chunks.push(value)),
      { user: { id: 9, email: 'user@example.com' } } as never,
    );

    expect(ChatOpenAI.prototype.stream).toHaveBeenCalledWith(expect.anything());
    expect(chunks.join('')).toContain('中转');
    expect(chunks.at(-1)).toBe('event: done\ndata: {}\n\n');
  });

  function createResponse(write: (value: string) => void) {
    return {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write,
      end: jest.fn(),
    } as never;
  }
});
