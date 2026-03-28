import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions.js';
import type { Message, MessageRole } from '../../domain/types.js';

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export type LLMTool = ChatCompletionTool;

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface LLMClient {
  chat(messages: Message[], options?: { temperature?: number; maxTokens?: number; tools?: LLMTool[] }): Promise<ChatResponse>;
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId ?? '' };
    }
    if (m.role === 'assistant' && m.toolCallId) {
      // Reconstruct assistant tool call message if needed
      return { 
        role: 'assistant' as const, 
        content: m.content || null, 
        tool_calls: [{
          id: m.toolCallId,
          type: 'function',
          function: { name: m.name ?? 'unknown', arguments: m.content }
        }]
      };
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

  async chat(messages: Message[], options?: { temperature?: number; maxTokens?: number; tools?: LLMTool[] }): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages: toOpenAIMessages(messages),
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemperature,
      tools: options?.tools,
    });

    const msg = response.choices[0]?.message;
    const content = msg?.content ?? '';
    
    let toolCalls: ToolCall[] | undefined;
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      toolCalls = msg.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    return { content, toolCalls };
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
