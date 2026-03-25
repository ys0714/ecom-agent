import type { GuardrailResult } from '../../domain/types.js';

const INJECTION_PATTERNS = [
  /忽略(上面|之前|以上)(的|所有)?(指令|规则|说明)/,
  /你(现在|从现在)(是|扮演|变成)/,
  /ignore\b.*\b(instructions|rules)/i,
  /you are now/i,
  /system\s*prompt/i,
  /\bDAN\b/,
  /jailbreak/i,
];

const SENSITIVE_WORDS: string[] = [];

export interface InputGuardConfig {
  injectionPatterns?: RegExp[];
  sensitiveWords?: string[];
  maxMessageLength?: number;
}

export class InputGuard {
  private patterns: RegExp[];
  private sensitiveWords: string[];
  private maxLength: number;

  constructor(config?: InputGuardConfig) {
    this.patterns = config?.injectionPatterns ?? INJECTION_PATTERNS;
    this.sensitiveWords = config?.sensitiveWords ?? SENSITIVE_WORDS;
    this.maxLength = config?.maxMessageLength ?? 2000;
  }

  check(message: string, userId?: string, sessionUserId?: string): GuardrailResult {
    if (message.length > this.maxLength) {
      return { passed: false, blockedBy: 'input', reason: '消息长度超过限制' };
    }

    for (const pattern of this.patterns) {
      if (pattern.test(message)) {
        return { passed: false, blockedBy: 'input', reason: '检测到疑似 Prompt 注入' };
      }
    }

    for (const word of this.sensitiveWords) {
      if (message.includes(word)) {
        return {
          passed: false, blockedBy: 'input', reason: '包含敏感词',
          sanitizedContent: message.replaceAll(word, '***'),
        };
      }
    }

    if (userId && sessionUserId && userId !== sessionUserId) {
      return { passed: false, blockedBy: 'input', reason: '用户身份不匹配' };
    }

    return { passed: true };
  }
}
