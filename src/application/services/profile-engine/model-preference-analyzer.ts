import type { LLMClient } from '../../../infra/adapters/llm.js';
import type { Message } from '../../../domain/types.js';
import type { OverrideType, PreferenceSignal } from './preference-detector.js';

export interface LLMPreferenceSignal extends PreferenceSignal {
  scope: 'this_turn' | 'session' | 'permanent';
  subject: 'self' | 'other';
  reasoning: string;
}

const ANALYSIS_PROMPT = `你是一个用户偏好分析专家。分析用户最新消息中的偏好信号。

输出严格 JSON（不要 markdown 代码块）：
{
  "type": "explicit_override" | "role_switch" | "fit_modifier" | "profile_correction" | "none",
  "confidence": 0.0~1.0,
  "value": {},
  "scope": "this_turn" | "session" | "permanent",
  "subject": "self" | "other",
  "reasoning": "一句话解释"
}

type 说明：
- explicit_override: 用户明确指定/拒绝某个规格（"我要L码"、"太小了换大的"）
- role_switch: 为他人购买（"帮老公买"、"朋友让我帮看"）
- fit_modifier: 偏好修饰（"要宽松的"、"太紧了"、"偏大一码"）
- profile_correction: 纠正自身画像（"我身高165"、"我现在110斤"）
- none: 无偏好信号

注意区分 subject：
- "我身高165" → subject=self
- "我朋友身高165" → subject=other
- "帮我老公看看，他180cm" → subject=other`;

export class ModelPreferenceAnalyzer {
  constructor(private llm: LLMClient) {}

  async analyze(userMessage: string, recentContext?: Message[]): Promise<LLMPreferenceSignal> {
    const contextText = recentContext
      ?.slice(-3)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n') ?? '';

    const prompt = contextText
      ? `最近对话：\n${contextText}\n\n用户最新消息：${userMessage}`
      : `用户消息：${userMessage}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: ANALYSIS_PROMPT, timestamp: '' },
        { role: 'user', content: prompt, timestamp: '' },
      ], { temperature: 0.1, maxTokens: 256 });

      return this.parseResponse(response);
    } catch {
      return this.fallback();
    }
  }

  private parseResponse(response: string): LLMPreferenceSignal {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.fallback();

      const parsed = JSON.parse(jsonMatch[0]);

      const validTypes: OverrideType[] = ['explicit_override', 'role_switch', 'fit_modifier', 'profile_correction', 'none'];
      const type = validTypes.includes(parsed.type) ? parsed.type : 'none';

      const validScopes = ['this_turn', 'session', 'permanent'];
      const scope = validScopes.includes(parsed.scope) ? parsed.scope : 'this_turn';

      const validSubjects = ['self', 'other'];
      const subject = validSubjects.includes(parsed.subject) ? parsed.subject : 'self';

      return {
        type,
        confidence: Math.max(0, Math.min(1, typeof parsed.confidence === 'number' ? parsed.confidence : 0)),
        value: typeof parsed.value === 'object' && parsed.value !== null ? parsed.value : {},
        source: 'conversation',
        scope,
        subject,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      };
    } catch {
      return this.fallback();
    }
  }

  private fallback(): LLMPreferenceSignal {
    return {
      type: 'none', confidence: 0, value: {},
      source: 'conversation', scope: 'this_turn', subject: 'self', reasoning: 'LLM 分析失败',
    };
  }
}
