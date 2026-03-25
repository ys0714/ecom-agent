import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import type { Message, MessageRole } from '../../domain/types.js';

export interface LLMClient {
  chat(messages: Message[], options?: { temperature?: number; maxTokens?: number }): Promise<string>;
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId ?? '' };
    }
    return { role: m.role as 'system' | 'user' | 'assistant', content: m.content };
  });
}

export class OpenAICompatibleClient implements LLMClient {
  private client: OpenAI;
  private modelId: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(opts: {
    baseUrl: string;
    apiKey: string;
    modelId: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }) {
    this.client = new OpenAI({
      baseURL: opts.baseUrl,
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs ?? 10_000,
    });
    this.modelId = opts.modelId;
    this.defaultMaxTokens = opts.maxTokens ?? 2048;
    this.defaultTemperature = opts.temperature ?? 0.7;
  }

  async chat(messages: Message[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages: toOpenAIMessages(messages),
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemperature,
    });

    return response.choices[0]?.message?.content ?? '';
  }
}

export function createLLMClient(opts: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  timeoutMs?: number;
}): LLMClient {
  return new OpenAICompatibleClient(opts);
}
