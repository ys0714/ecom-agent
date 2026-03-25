import type { Message, WorkflowType, SpecRecommendation, ProductInfo, GenderRole } from '../domain/types.js';
import { InMemoryEventBus, createEvent } from '../domain/event-bus.js';
import { UserProfileEntity } from '../domain/entities/user-profile.entity.js';
import { ModelSlotManager } from './services/model-slot/model-slot-manager.js';
import { IntentRouter } from './workflow/intent-router.js';
import { matchSpecs } from './services/profile-engine/spec-inference.js';
import { ColdStartManager } from './services/profile-engine/cold-start-manager.js';
import { PreferenceDetector, detectAllByRules } from './services/profile-engine/preference-detector.js';
import { arbitrate } from './services/profile-engine/confidence-arbitrator.js';
import { generateExplanation, formatExplanationForReply } from './services/profile-engine/explanation-generator.js';
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
  ): Promise<{ reply: string; intent: WorkflowType; recommendation: SpecRecommendation | null; debug: Record<string, unknown> }> {
    const { eventBus, modelSlotManager, intentRouter, coldStartManager } = this.deps;

    const userMsg: Message = { role: 'user', content: userText, timestamp: new Date().toISOString() };
    conversationHistory.push(userMsg);
    eventBus.publish(createEvent('message:user', { content: userText }, sessionId));

    const intentResult = await intentRouter.classify(userMsg);

    const prefDetector = new PreferenceDetector();
    const prefSignals = detectAllByRules(userText);
    const prefSignal = prefSignals[0] ?? { type: 'none' as const, confidence: 0, value: {}, source: 'conversation' as const };

    let activeRole: GenderRole | undefined;
    const roleSignal = prefSignals.find((s) => s.type === 'role_switch');
    if (roleSignal) {
      activeRole = roleSignal.value.targetRole as GenderRole;
    }

    const correctionSignal = prefSignals.find((s) => s.type === 'profile_correction');
    if (correctionSignal) {
      const corrections = correctionSignal.value;
      const role = activeRole ?? profile.spec.defaultRole;
      const delta: Record<string, unknown> = { role };
      if (corrections.height) delta.height = [corrections.height, corrections.height] as [number, number];
      if (corrections.weight) delta.weight = [corrections.weight, corrections.weight] as [number, number];
      profile.applyDelta({ dimensionId: 'specPreference', delta, source: 'conversation', timestamp: new Date().toISOString() });
    }

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
      if (prefSignal.type === 'explicit_override' && prefSignal.value.specifiedSize) {
        reply += `\n\n好的，已为您锁定 ${prefSignal.value.specifiedSize} 码。`;
      } else {
        recommendation = await this.trySpecRecommendation(profile, userText, activeRole);
        if (recommendation) {
          const product = await this.findProduct(userText);
          const genderProfile = profile.getGenderProfile(activeRole);
          const matchedSpec = product?.specs.find((s) => s.propValueId === recommendation!.propValueId);

          if (genderProfile && matchedSpec) {
            const explanation = generateExplanation({
              profile: genderProfile,
              productSpec: matchedSpec,
              matchResult: { propValueId: recommendation.propValueId, totalCoverage: recommendation.confidence, featureCoverages: {}, matchedFeatureCount: 0 },
              confidence: recommendation.confidence,
              orderCount: profile.meta.totalOrders,
              isTemporaryProfile: prefSignal.type === 'role_switch',
            });
            reply += '\n\n' + formatExplanationForReply(explanation);
          } else {
            const specLine = Object.entries(recommendation.selectedSpecs).map(([k, v]) => `${k}: ${v}`).join(', ');
            reply += `\n\n【规格推荐】${specLine}（匹配度 ${Math.round(recommendation.confidence * 100)}%）`;
          }
        }
      }
    }

    const assistantMsg: Message = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
    conversationHistory.push(assistantMsg);
    eventBus.publish(createEvent('message:assistant', { content: reply }, sessionId));

    const debug: Record<string, unknown> = {
      intent: intentResult.intent,
      latencyMs: Date.now() - startTime,
      profile: { completeness: profile.getCompleteness(), coldStartStage: profile.getColdStartStage(), summary: profile.summarizeForPrompt() },
      preferenceSignal: prefSignal,
      arbitration: prefSignals.length > 1 ? { signals: prefSignals, activeRole } : null,
      recommendation,
    };

    return { reply, intent: intentResult.intent, recommendation, debug };
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
    userText: string,
    overrideRole?: GenderRole,
  ): Promise<SpecRecommendation | null> {
    if (!this.deps.productService) return null;

    const product = await this.findProduct(userText);
    if (!product) return null;

    return matchSpecs(profile, product);
  }

  private async findProduct(userText: string): Promise<ProductInfo | null> {
    if (!this.deps.productService) return null;
    const productId = this.extractProductId(userText);
    if (!productId) return null;
    return this.deps.productService.getProductById(productId);
  }

  private extractProductId(text: string): string | null {
    const patterns = [
      /(?:商品|产品|货号|编号|ID)[：:\s]*([a-zA-Z0-9_-]+)/i,
      /\bp(\d+)\b/i,
    ];
    for (const p of patterns) {
      const match = text.match(p);
      if (match) return match[1].startsWith('p') ? match[1] : `p${match[1]}`;
    }
    return null;
  }
}
