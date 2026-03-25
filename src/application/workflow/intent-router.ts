import type { Message, WorkflowType, IntentResult } from '../../domain/types.js';

const KEYWORD_RULES: Array<{ keywords: string[]; intent: WorkflowType }> = [
  { keywords: ['退款', '退货', '换货', '退钱', '售后'], intent: 'after_sale' },
  { keywords: ['快递', '物流', '发货', '到哪了', '配送'], intent: 'logistics' },
  { keywords: ['投诉', '差评', '举报', '不满意', '太差'], intent: 'complaint' },
  { keywords: ['推荐', '尺码', '规格', '买', '看看', '多少钱', '有没有', '商品', '款'], intent: 'product_consult' },
];

/**
 * Rule-based fast intent classification (zero LLM calls).
 * Returns null if no rule matches — caller can fallback to LLM classification.
 */
export function classifyByRules(message: string): IntentResult | null {
  const normalized = message.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (normalized.includes(kw)) {
        return { intent: rule.intent, confidence: 0.8, entities: {} };
      }
    }
  }
  return null;
}

export class IntentRouter {
  /**
   * Classify user intent — fast rules first, fallback to 'general'.
   * LLM-based classification can be added later via llmClassify param.
   */
  async classify(
    message: Message,
    _context?: unknown,
    llmClassify?: (text: string) => Promise<IntentResult>,
  ): Promise<IntentResult> {
    const ruleResult = classifyByRules(message.content);
    if (ruleResult) return ruleResult;

    if (llmClassify) {
      try {
        return await llmClassify(message.content);
      } catch { /* fall through to default */ }
    }

    return { intent: 'general', confidence: 0.5, entities: {} };
  }
}
