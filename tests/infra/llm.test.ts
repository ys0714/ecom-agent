import { describe, it, expect, vi } from 'vitest';
import type { LLMClient } from '../../src/infra/adapters/llm.js';
import type { Message } from '../../src/domain/types.js';

function createMockLLM(response: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue(response),
  };
}

describe('LLMClient (mock)', () => {
  it('returns mocked response', async () => {
    const llm = createMockLLM('推荐您选择 L 码');
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful agent', timestamp: new Date().toISOString() },
      { role: 'user', content: '帮我推荐尺码', timestamp: new Date().toISOString() },
    ];

    const result = await llm.chat(messages);
    expect(result).toBe('推荐您选择 L 码');
    expect(llm.chat).toHaveBeenCalledOnce();
  });

  it('passes messages correctly', async () => {
    const llm = createMockLLM('ok');
    const messages: Message[] = [
      { role: 'user', content: 'hello', timestamp: new Date().toISOString() },
    ];

    await llm.chat(messages, { temperature: 0.5 });
    expect(llm.chat).toHaveBeenCalledWith(messages, { temperature: 0.5 });
  });
});
