import type { GuardrailResult } from '../../domain/types.js';

const PII_PATTERNS: Array<{ pattern: RegExp; label: string; replacement: string }> = [
  { pattern: /1[3-9]\d{9}/g, label: '手机号', replacement: '1**********' },
  { pattern: /\d{17}[\dXx]/g, label: '身份证号', replacement: '******************' },
  { pattern: /\d{16,19}/g, label: '银行卡号', replacement: '****' },
  { pattern: /[\w.-]+@[\w.-]+\.\w+/g, label: '邮箱', replacement: '***@***.com' },
];

const UNAUTHORIZED_COMMITMENTS = [
  /保证(全额)?退(款|钱)/,
  /一定(给你|帮你)(退|赔)/,
  /无条件退(款|货)/,
  /双倍赔偿/,
  /免费(送|赠|给)/,
];

export class OutputGuard {
  checkAndSanitize(response: string): GuardrailResult {
    let sanitized = response;
    let hasPII = false;

    for (const { pattern, replacement } of PII_PATTERNS) {
      if (pattern.test(sanitized)) {
        hasPII = true;
        sanitized = sanitized.replace(pattern, replacement);
        pattern.lastIndex = 0;
      }
    }

    for (const pattern of UNAUTHORIZED_COMMITMENTS) {
      if (pattern.test(sanitized)) {
        return {
          passed: false,
          blockedBy: 'output',
          reason: '包含未授权承诺',
          sanitizedContent: '抱歉，关于退款/赔偿等事宜，请联系人工客服为您处理。',
        };
      }
    }

    if (hasPII) {
      return { passed: true, sanitizedContent: sanitized };
    }

    return { passed: true };
  }
}
