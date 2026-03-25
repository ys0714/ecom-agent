import type { Message, WorkflowType, SpecRecommendation, ProductInfo } from '../domain/types.js';
import { InMemoryEventBus, createEvent } from '../domain/event-bus.js';
import { UserProfileEntity } from '../domain/entities/user-profile.entity.js';
import { ModelSlotManager } from './services/model-slot/model-slot-manager.js';
import { IntentRouter } from './workflow/intent-router.js';
import { matchSpecs } from './services/profile-engine/spec-inference.js';
import { ColdStartManager } from './services/profile-engine/cold-start-manager.js';
import type { ProfileStore } from './services/profile-store.js';
import type { ProductService } from '../infra/adapters/product-service.js';

const GUARDRAIL_INSTRUCTIONS = '你不能做出退款、赔偿等未经授权的承诺。不要暴露用户的手机号、地址等隐私信息。';

export interface AgentDeps {
  eventBus: InMemoryEventBus;
  profileStore: ProfileStore;
  modelSlotManager: ModelSlotManager;
  intentRouter: IntentRouter;
  coldStartManager: ColdStartManager;
  productService?: ProductService;
  slidingWindowSize?: number;
}

export class Agent {
  private deps: AgentDeps;
  private windowSize: number;

  constructor(deps: AgentDeps) {
    this.deps = deps;
    this.windowSize = deps.slidingWindowSize ?? 10;
  }

  async handleMessage(
    userId: string,
    sessionId: string,
    userText: string,
    conversationHistory: Message[],
    profile: UserProfileEntity,
  ): Promise<{ reply: string; intent: WorkflowType; recommendation: SpecRecommendation | null }> {
    const { eventBus, modelSlotManager, intentRouter, coldStartManager } = this.deps;

    const userMsg: Message = { role: 'user', content: userText, timestamp: new Date().toISOString() };
    conversationHistory.push(userMsg);
    eventBus.publish(createEvent('message:user', { content: userText }, sessionId));

    const intentResult = await intentRouter.classify(userMsg);

    const coldAction = coldStartManager.getAction(profile);
    let coldStartHint = '';
    if (coldAction.type === 'ask_preference') {
      coldStartHint = `\n\n另外，${coldAction.question}`;
    }

    const systemPrompt = this.buildSystemPrompt(profile, intentResult.intent);

    const window = conversationHistory.slice(-this.windowSize);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt, timestamp: new Date().toISOString() },
      ...window,
    ];

    const startTime = Date.now();
    let reply: string;
    try {
      reply = await modelSlotManager.infer('conversation', messages, sessionId);
    } catch (err) {
      eventBus.publish(createEvent('system:error', {
        error: err instanceof Error ? err.message : String(err),
      }, sessionId));
      reply = '抱歉，系统暂时无法处理您的请求，请稍后再试。';
    }

    if (coldStartHint) {
      reply += coldStartHint;
    }

    let recommendation: SpecRecommendation | null = null;
    if (intentResult.intent === 'product_consult' && this.deps.productService) {
      recommendation = await this.trySpecRecommendation(profile, userText);
    }

    const assistantMsg: Message = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
    conversationHistory.push(assistantMsg);
    eventBus.publish(createEvent('message:assistant', { content: reply }, sessionId));

    return { reply, intent: intentResult.intent, recommendation };
  }

  private buildSystemPrompt(profile: UserProfileEntity, workflow: WorkflowType): string {
    const completeness = profile.getCompleteness();
    const profileSection = completeness >= 0.7
      ? `用户画像：${profile.summarizeForPrompt()}`
      : completeness >= 0.3
        ? `用户画像（积累中）：${profile.summarizeForPrompt()}`
        : '暂无用户画像，请在对话中主动询问用户的身高、体重、常穿尺码等信息。';

    const workflowInstructions: Record<WorkflowType, string> = {
      product_consult: '帮助用户选购商品，提供规格推荐和比价建议。',
      after_sale: '处理退款、退货、换货等售后问题。',
      logistics: '查询物流状态和配送信息。',
      complaint: '请以安抚为优先策略，耐心倾听用户诉求。',
      general: '回答用户的一般性问题。',
    };

    return `你是一个专业的电商客服。
${profileSection}
当前场景：${workflowInstructions[workflow]}
${GUARDRAIL_INSTRUCTIONS}
回复要求：简洁专业，不超过200字。`;
  }

  private async trySpecRecommendation(
    profile: UserProfileEntity,
    _userText: string,
  ): Promise<SpecRecommendation | null> {
    // In full implementation, extract productId from user message and query ProductService.
    // For now, return null — coverage matching is already tested via matchSpecs().
    return null;
  }
}
