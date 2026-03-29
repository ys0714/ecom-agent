import type { Message, WorkflowType, SpecRecommendation, ProductInfo, GenderRole } from '../domain/types.js';
import { InMemoryEventBus, createEvent } from '../domain/event-bus.js';
import { UserProfileEntity } from '../domain/entities/user-profile.entity.js';
import { ModelSlotManager } from './services/model-slot/model-slot-manager.js';
import { IntentRouter } from './workflow/intent-router.js';
import { matchSpecs, type MatchSpecsResult } from './services/profile-engine/spec-inference.js';
import { ColdStartManager } from './services/profile-engine/cold-start-manager.js';
import { PreferenceDetector, detectAllByRules } from './services/profile-engine/preference-detector.js';
import { arbitrate } from './services/profile-engine/confidence-arbitrator.js';
import { generateExplanation, formatExplanationForReply } from './services/profile-engine/explanation-generator.js';
import { SpecRecommendationEvaluator } from './services/data-flywheel/evaluator.js';
import { SegmentCompressor } from './services/context/segment-compressor.js';
import type { ProfileStore } from './services/profile-store.js';
import type { ProductService } from '../infra/adapters/product-service.js';
import type { LLMClient, LLMTool } from '../infra/adapters/llm.js';
import type { VectorStore } from '../infra/adapters/vector-store.js';
import { ExecutionGuard } from './guardrails/execution-guard.js';
import type { BadCaseCollector } from './services/data-flywheel/badcase-collector.js';

const GUARDRAIL_INSTRUCTIONS = '你不能做出退款、赔偿等未经授权的承诺。不要暴露用户的手机号、地址等隐私信息。不要自行生成【推荐】【规格推荐】等格式的尺码推荐文案，尺码推荐由系统自动附加。';
const MAX_TOOL_CALLS_PER_TURN = 2;
const MAX_RECALL_TURNS = 20;
const MAX_RECALL_CHARS = 4000;

export interface AgentDeps {
  eventBus: InMemoryEventBus;
  profileStore: ProfileStore;
  modelSlotManager: ModelSlotManager;
  intentRouter: IntentRouter;
  coldStartManager: ColdStartManager;
  productService?: ProductService;
  llmClient?: LLMClient;
  evaluator?: SpecRecommendationEvaluator;
  slidingWindowSize?: number;
  segmentCompressor?: SegmentCompressor;
  vectorStore?: VectorStore;
  executionGuard?: ExecutionGuard;
  badcaseCollector?: BadCaseCollector;
}

const MAX_COMPRESSOR_CACHE = 200;

export class Agent {
  private deps: AgentDeps;
  private windowSize: number;
  private compressors = new Map<string, SegmentCompressor>();
  private executionGuard: ExecutionGuard;

  constructor(deps: AgentDeps) {
    this.deps = deps;
    this.windowSize = deps.slidingWindowSize ?? 10;
    this.executionGuard = deps.executionGuard ?? new ExecutionGuard();
  }

  private getCompressor(sessionId: string): SegmentCompressor {
    let c = this.compressors.get(sessionId);
    if (c) {
      this.compressors.delete(sessionId);
      this.compressors.set(sessionId, c);
      return c;
    }
    c = new SegmentCompressor({
      llmClient: this.deps.llmClient,
      segmentSize: this.deps.segmentCompressor?.segmentSize,
    });
    this.compressors.set(sessionId, c);
    if (this.compressors.size > MAX_COMPRESSOR_CACHE) {
      const oldest = this.compressors.keys().next().value;
      if (oldest) this.compressors.delete(oldest);
    }
    return c;
  }

  async handleMessage(
    userId: string,
    sessionId: string,
    userTextParam: string,
    conversationHistory: Message[],
    profile: UserProfileEntity,
  ): Promise<{ reply: string; intent: WorkflowType; recommendation: SpecRecommendation | null; debug: Record<string, unknown> }> {
    const { eventBus, modelSlotManager, intentRouter, coldStartManager } = this.deps;
    const compressor = this.getCompressor(sessionId);

    const userMsg: Message = { role: 'user', content: userTextParam, timestamp: new Date().toISOString() };
    conversationHistory.push(userMsg);
    eventBus.publish(createEvent('message:user', { content: userTextParam }, sessionId));

    let userText = userTextParam;

    const intentResult = await intentRouter.classify(userMsg);

    const prefDetector = new PreferenceDetector(this.deps.llmClient);
    const hybridPrefSignal = await prefDetector.detectHybrid(userText, conversationHistory.slice(-3));
    const prefSignal = hybridPrefSignal;

    let activeRole: GenderRole | undefined;
    if (prefSignal.type === 'role_switch') {
      activeRole = prefSignal.value.targetRole as GenderRole;
    }

    const existingConfidence = profile.meta.totalOrders >= 5 ? 0.9 : profile.meta.totalOrders >= 1 ? 0.6 : 0.1;
    const arbitrationResult = arbitrate(existingConfidence, prefSignal);

    // Attempt to extract activeRole from user text
    if (!activeRole && this.deps.productService) {
      const productForDetection = await this.findProduct(userText);
      if (productForDetection) {
        const audiences = new Set(productForDetection.specs.map(s => s.targetAudience));
        if (audiences.size === 1) {
          const audience = Array.from(audiences)[0];
          if (audience === 'child') activeRole = 'child';
          else if (audience === 'adult_male') activeRole = 'male';
          else if (audience === 'adult_female') activeRole = 'female';
        }
      }
    }

    // Explicitly check for role switch when we are in a product context and it's a child product,
    // but the system hasn't caught the role switch.
    if (!activeRole && this.deps.productService) {
      let currentOrPastProduct = await this.findProduct(userText);
      if (!currentOrPastProduct && conversationHistory.length > 0) {
        for (let i = conversationHistory.length - 1; i >= 0; i--) {
          const msg = conversationHistory[i];
          if (msg.role === 'user') {
            currentOrPastProduct = await this.findProduct(msg.content);
            if (currentOrPastProduct) break;
          }
        }
      }
      if (currentOrPastProduct) {
        const audiences = new Set(currentOrPastProduct.specs.map(s => s.targetAudience));
        if (audiences.size === 1 && Array.from(audiences)[0] === 'child') {
          activeRole = 'child';
        }
      }
    }

    // Force re-evaluation of Intent and role if it's a profile correction
    // Sometimes the IntentRouter thinks "身高130cm，体重50斤" is just "general" or misses context
    if (prefSignal.type === 'profile_correction' && conversationHistory.length > 0) {
      let pastProduct = null;
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if (msg.role === 'user') {
          pastProduct = await this.findProduct(msg.content);
          if (pastProduct) {
            break;
          }
        }
      }
      
      if (pastProduct) {
        // If we were just talking about a product, this profile correction is likely for product consult
        if (intentResult.intent === 'general') {
          intentResult.intent = 'product_consult';
        }
        
        // Ensure activeRole is set correctly based on the product
        if (!activeRole) {
          const audiences = new Set(pastProduct.specs.map(s => s.targetAudience));
          if (audiences.size === 1) {
            const audience = Array.from(audiences)[0];
            if (audience === 'child') activeRole = 'child';
            else if (audience === 'adult_male') activeRole = 'male';
            else if (audience === 'adult_female') activeRole = 'female';
          }
        }
        
        // Let the system know what product we are consulting about so the rest of the flow works
        if (!userText.includes(pastProduct.productId) && !userText.includes(pastProduct.productName)) {
           userText = `${userText} (针对商品${pastProduct.productId})`;
        }
      }
    }

    if (prefSignal.type === 'profile_correction' && arbitrationResult.decision !== 'ignore') {
      const corrections = prefSignal.value;
      
      // If we know the product is for child, but rule detector didn't catch role_switch, update the delta role
      // This helps apply the correction to the correct child profile.
      // Additionally, make sure to force role to activeRole if it was inferred
      let role = activeRole ?? profile.spec.defaultRole;
      
      const delta: Record<string, unknown> = { role };
      const normalizedHeight = this.coerceFiniteNumber(corrections.height);
      const normalizedWeight = this.coerceFiniteNumber(corrections.weight);
      if (normalizedHeight !== null) delta.height = [normalizedHeight, normalizedHeight] as [number, number];
      if (normalizedWeight !== null) delta.weight = [normalizedWeight, normalizedWeight] as [number, number];
      if (normalizedHeight !== null || normalizedWeight !== null) {
        profile.applyDelta({ dimensionId: 'specPreference', delta, source: 'conversation', timestamp: new Date().toISOString() });
      }
    }

    const coldAction = coldStartManager.getAction(profile, userId);
    let coldStartInstruction = '';
    if (coldAction.type === 'ask_preference') {
      coldStartInstruction = `\n重要：用户画像不足，请在回复中自然地融入以下询问（不要生硬追加）：${coldAction.question}`;
    }

    const overflowCount = conversationHistory.length - this.windowSize;
    if (overflowCount > 0) {
      const overflowMessages = conversationHistory.slice(0, overflowCount);
      const newOverflow = overflowMessages.slice(-(overflowCount));
      const prevLen = conversationHistory.length - newOverflow.length - this.windowSize;
      if (newOverflow.length > 0 && prevLen >= 0) {
        await compressor.addOverflow(
          newOverflow,
          intentResult.intent,
          prefSignal.type === 'role_switch',
        );
      }
    }

    const fewShotExamples = await this.getFewShotExamples(userText);
    const systemPrompt = this.buildSystemPrompt(profile, intentResult.intent, activeRole, compressor, fewShotExamples, coldStartInstruction);

    const window = conversationHistory.slice(-this.windowSize);
    // Layer 4: Current Message is part of the window array.
    const messages: Message[] = [
      { role: 'system', content: systemPrompt, timestamp: new Date().toISOString() },
      ...window,
    ];

    const tools: LLMTool[] = [{
      type: 'function',
      function: {
        name: 'recall_history',
        description: '当历史摘要无法提供足够细节时，根据摘要中的轮次范围（如"第0-4轮"）检索完整原始对话记录。',
        parameters: {
          type: 'object',
          properties: {
            startTurn: { type: 'number', description: '起始轮次（如第0-4轮则传入0）' },
            endTurn: { type: 'number', description: '结束轮次（如第0-4轮则传入4）' }
          },
          required: ['startTurn', 'endTurn']
        }
      }
    }];

    const startTime = Date.now();
    let reply: string = '';
    
    try {
      let response = await modelSlotManager.infer('conversation', messages, sessionId, tools);

      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolCalls = response.toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);
        for (const tc of toolCalls) {
          if (tc.name === 'recall_history') {
            const permission = this.executionGuard.checkToolPermission(tc.name, intentResult.intent);
            if (!permission.passed) {
              eventBus.publish(createEvent('guardrail:blocked', {
                blockedBy: permission.blockedBy ?? 'execution',
                reason: permission.reason ?? `tool ${tc.name} blocked`,
                tool: tc.name,
              }, sessionId));
              messages.push({ role: 'assistant', content: '', toolCallId: tc.id, name: tc.name, timestamp: new Date().toISOString() });
              messages.push({ role: 'tool', content: '检索失败: 工具权限受限', toolCallId: tc.id, name: tc.name, timestamp: new Date().toISOString() });
              continue;
            }
            try {
              const args = JSON.parse(tc.arguments);
              const rawStart = Number(args.startTurn);
              const rawEnd = Number(args.endTurn);
              if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
                throw new Error('invalid range');
              }
              const start = Math.max(0, Math.floor(rawStart));
              const requestedEnd = Math.max(start, Math.floor(rawEnd));
              const cappedEnd = Math.min(start + MAX_RECALL_TURNS - 1, requestedEnd);
              const end = Math.min(conversationHistory.length - 1, cappedEnd);

              let recalled = conversationHistory.slice(start, end + 1)
                .map(m => `[${m.role === 'user' ? '用户' : '客服'}]: ${m.content}`)
                .join('\n');
              if (recalled.length > MAX_RECALL_CHARS) {
                recalled = `${recalled.slice(0, MAX_RECALL_CHARS)}\n...(已截断)`;
              }

              messages.push({ role: 'assistant', content: '', toolCallId: tc.id, name: tc.name, timestamp: new Date().toISOString() });
              messages.push({ role: 'tool', content: recalled || '无记录', toolCallId: tc.id, name: tc.name, timestamp: new Date().toISOString() });

              eventBus.publish(createEvent('tool:call', { tool: 'recall_history', args: { startTurn: start, endTurn: end } }, sessionId));
              eventBus.publish(createEvent('tool:result', {
                tool: 'recall_history',
                resultPreview: recalled.slice(0, 300),
                truncated: recalled.endsWith('...(已截断)'),
              }, sessionId));
            } catch (e) {
              messages.push({ role: 'assistant', content: '', toolCallId: tc.id, name: tc.name, timestamp: new Date().toISOString() });
              messages.push({ role: 'tool', content: '检索失败: 参数错误', toolCallId: tc.id, name: tc.name, timestamp: new Date().toISOString() });
            }
          }
        }
        response = await modelSlotManager.infer('conversation', messages, sessionId, tools);
      }
      reply = response.content;
    } catch (err) {
      eventBus.publish(createEvent('system:error', {
        error: err instanceof Error ? err.message : String(err),
      }, sessionId));
      reply = '抱歉，系统暂时无法处理您的请求，请稍后再试。';
    }

    // coldStartInstruction is now injected into System Prompt, not appended to reply

    let recommendation: SpecRecommendation | null = null;
    let matchResultDetail: any = null;

    if (intentResult.intent === 'product_consult' && this.deps.productService) {
      if (prefSignal.type === 'explicit_override' && prefSignal.value.specifiedSize) {
        reply += `\n\n好的，已为您锁定 ${prefSignal.value.specifiedSize} 码。`;
      } else {
        const matchOutput = await this.trySpecRecommendation(profile, userText, activeRole);
        if (matchOutput) {
          recommendation = matchOutput.recommendation;
          matchResultDetail = matchOutput.matchDetail;

          const product = await this.findProduct(userText);
          const genderProfile = profile.getGenderProfile(activeRole);
          const matchedSpec = product?.specs.find((s) => s.propValueId === recommendation!.propValueId);

          if (genderProfile && matchedSpec && matchResultDetail) {
            const explanation = generateExplanation({
              profile: genderProfile,
              productSpec: matchedSpec,
              matchResult: matchResultDetail,
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

    if (recommendation && this.deps.evaluator) {
      // Very basic outcome tracking for now: assume accepted if no override
      // In a real system, we'd wait for next turn or order event
      const outcome = prefSignal.type === 'explicit_override' ? 'spec_rejected' : 'spec_accepted';
      this.deps.evaluator.recordOutcome(recommendation, outcome);

      // 触发数据飞轮收集
      if (outcome === 'spec_rejected' && this.deps.badcaseCollector) {
        const trace = {
          promptVersion: 'current',
          profileSnapshot: Object.assign({}, profile.spec),
          profileCompleteness: profile.getCompleteness(),
          coldStartStage: profile.getColdStartStage(),
          specMatchResult: matchResultDetail || { attempted: false, topCandidates: [], selectedSpec: null, fallbackToModel: false },
          intentResult,
          workflow: intentResult.intent,
        };
        const bc = this.deps.badcaseCollector.collect(
          'spec_override',
          sessionId,
          userId,
          userText,
          reply,
          trace,
          recommendation
        );
        eventBus.publish(createEvent('badcase:detected', { badcaseId: bc.id }, sessionId));
      }
    }

    const assistantMsg: Message = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
    conversationHistory.push(assistantMsg);
    eventBus.publish(createEvent('message:assistant', { content: reply }, sessionId));

    const compressedSegments = compressor.getSegments();
    const debug: Record<string, unknown> = {
      intent: intentResult.intent,
      latencyMs: Date.now() - startTime,
      profile: { completeness: profile.getCompleteness(), coldStartStage: profile.getColdStartStage(), summary: profile.summarizeForPrompt() },
      preferenceSignal: prefSignal,
      arbitration: { activeRole: activeRole ?? null, ...arbitrationResult },
      recommendation,
      memory: compressedSegments.length > 0 ? { segments: compressedSegments, totalSegments: compressedSegments.length } : null,
      messagesForDistillation: messages, // Exported for data flywheel distillation
    };

    eventBus.publish(createEvent('turn:trace', {
      userMessage: userText,
      assistantMessage: reply,
      ...debug,
    }, sessionId));

    return { reply, intent: intentResult.intent, recommendation, debug };
  }

  private async getFewShotExamples(userText: string): Promise<string> {
    if (!this.deps.vectorStore) return '';
    try {
      const results = await this.deps.vectorStore.search(userText, 2);
      if (results.length === 0) return '';
      
      const examples = results.map((r, i) => `[示例 ${i + 1}]\n${r.text}`).join('\n\n');
      return `\n\n【参考修正案例】\n以下是历史上类似场景的最佳回复策略，请在回复时参考：\n${examples}`;
    } catch (err) {
      // Ignore errors if VectorStore is not initialized
      return '';
    }
  }

  private buildSystemPrompt(profile: UserProfileEntity, workflow: WorkflowType, activeRole?: GenderRole, compressor?: SegmentCompressor, fewShotExamples: string = '', coldStartInstruction: string = ''): string {
    // --- Layer 1: Bootstrap (不变的系统底层) ---
    const roleInstruction = '你是一个专业的电商客服。回复要求：简洁专业，不超过200字。';

    let profileSummary: string;
    const completeness = profile.getCompleteness();
    
    if (activeRole && activeRole !== profile.spec.defaultRole) {
      const gp = profile.getGenderProfile(activeRole);
      profileSummary = gp
        ? `当前为他人选购（${activeRole === 'male' ? '男性' : activeRole === 'child' ? '儿童' : '女性'}），画像：${JSON.stringify(gp)}`
        : `当前为他人选购（${activeRole === 'male' ? '男性' : activeRole === 'child' ? '儿童' : '女性'}），暂无该角色的身材数据，请询问对方的身高、体重等信息。`;
    } else {
      profileSummary = completeness >= 0.7
        ? profile.summarizeForPrompt()
        : completeness >= 0.3
          ? profile.summarizeForPrompt()
          : '';
    }

    const profileSection = profileSummary
      ? (completeness >= 0.7 ? `[用户画像]\n${profileSummary}` : `[用户画像] (积累中)\n${profileSummary}`)
      : '[用户画像]\n暂无用户画像，请在对话中主动询问用户的身高、体重、常穿尺码等信息。';

    const workflowInstructions: Record<WorkflowType, string> = {
      product_consult: '帮助用户选购商品，提供规格推荐和比价建议。',
      after_sale: '处理退款、退货、换货等售后问题。',
      logistics: '查询物流状态和配送信息。',
      complaint: '请以安抚为优先策略，耐心倾听用户诉求。',
      general: '回答用户的一般性问题。',
    };
    
    const workflowSection = `[当前场景]\n${workflowInstructions[workflow]}`;
    const guardrailSection = `[安全护栏]\n${GUARDRAIL_INSTRUCTIONS}`;
    
    const bootstrapLayer = `${roleInstruction}\n\n${profileSection}\n\n${workflowSection}\n\n${guardrailSection}`;

    // --- Layer 2: Conversation History (受压缩的历史层) ---
    const historySection = compressor?.formatForPrompt() ?? '';
    const historyLayer = historySection ? `\n\n${historySection}` : '';

    // --- Layer 3: Tool Results (按需检索的工作记忆层) ---
    // (Few-shot examples and cold start dynamic instructions act as injected facts)
    const toolResultsLayer = (fewShotExamples || coldStartInstruction) ? `\n\n--- 动态工作记忆 ---\n${coldStartInstruction}${fewShotExamples}` : '';

    return `${bootstrapLayer}${historyLayer}${toolResultsLayer}`;
  }

  private async trySpecRecommendation(
    profile: UserProfileEntity,
    userText: string,
    overrideRole?: GenderRole,
  ): Promise<MatchSpecsResult | null> {
    if (!this.deps.productService) return null;

    const product = await this.findProduct(userText);
    if (!product) return null;

    return matchSpecs(profile, product, undefined, overrideRole);
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

  private coerceFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const m = value.match(/-?\d+(?:\.\d+)?/);
      if (!m) return null;
      const n = Number.parseFloat(m[0]);
      return Number.isFinite(n) ? n : null;
    }
    if (Array.isArray(value) && value.length > 0) {
      return this.coerceFiniteNumber(value[0]);
    }
    return null;
  }

}
