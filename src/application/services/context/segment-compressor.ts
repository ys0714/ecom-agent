import type { Message, WorkflowType, CompressedSegment } from '../../../domain/types.js';
import type { LLMClient } from '../../../infra/adapters/llm.js';
import type { OverrideType } from '../profile-engine/preference-detector.js';

const DEFAULT_SEGMENT_SIZE = 5;

export interface SegmentCompressorOpts {
  segmentSize?: number;
  llmClient?: LLMClient;
}

/**
 * Compresses conversation messages that overflow the sliding window into
 * structured summaries. Two segmentation triggers:
 *   1. Fixed turn count (every SEGMENT_SIZE messages)
 *   2. Role switch signal forces a segment boundary
 */
export class SegmentCompressor {
  private segments: CompressedSegment[] = [];
  private pendingMessages: Message[] = [];
  private pendingIntent: WorkflowType = 'general';
  private turnCounter = 0;
  private _segmentSize: number;
  private llmClient?: LLMClient;

  constructor(opts: SegmentCompressorOpts = {}) {
    this._segmentSize = opts.segmentSize ?? DEFAULT_SEGMENT_SIZE;
    this.llmClient = opts.llmClient;
  }

  get segmentSize(): number { return this._segmentSize; }

  /**
   * Feed overflow messages from the sliding window.
   * Call this with the messages that were evicted when the window shifts.
   * Returns true if a new segment was created.
   */
  async addOverflow(
    messages: Message[],
    currentIntent: WorkflowType,
    hasRoleSwitch: boolean,
  ): Promise<boolean> {
    for (const msg of messages) {
      this.pendingMessages.push(msg);
      this.pendingIntent = currentIntent;
      this.turnCounter++;
    }

    let created = false;

    if (hasRoleSwitch && this.pendingMessages.length > 0) {
      await this.flushSegment();
      created = true;
    }

    while (this.pendingMessages.length >= this._segmentSize) {
      const batch = this.pendingMessages.splice(0, this._segmentSize);
      const startTurn = this.turnCounter - this.pendingMessages.length - batch.length;
      await this.flushBatch(batch, startTurn);
      created = true;
    }

    return created;
  }

  private async flushSegment(): Promise<void> {
    if (this.pendingMessages.length === 0) return;
    const batch = this.pendingMessages.splice(0);
    const startTurn = this.turnCounter - batch.length;
    await this.flushBatch(batch, startTurn);
  }

  private async flushBatch(batch: Message[], startTurn: number): Promise<void> {
    const endTurn = startTurn + batch.length - 1;

    const { summary, factSlots } = await this.compress(batch);

    // Naive token estimation: ~1 token per 2 chars for Chinese + English mix
    const batchText = batch.map(m => m.content).join(' ');
    const originalTokens = Math.ceil(batchText.length / 2);
    const compressedText = summary + JSON.stringify(factSlots);
    const tokenUsage = Math.ceil(compressedText.length / 2);

    const segment: CompressedSegment = {
      segmentIndex: this.segments.length,
      turnRange: [startTurn, endTurn],
      tokenUsage,
      summary,
      factSlots,
    };

    this.segments.push(segment);
  }

  private async compress(messages: Message[]): Promise<{ summary: string; factSlots: CompressedSegment['factSlots'] }> {
    if (this.llmClient) {
      return this.compressWithLLM(messages);
    }
    return this.compressWithRules(messages);
  }

  private async compressWithLLM(messages: Message[]): Promise<{ summary: string; factSlots: CompressedSegment['factSlots'] }> {
    const conversation = messages
      .map((m) => `${m.role === 'user' ? '用户' : '客服'}: ${m.content}`)
      .join('\n');

    const prompt = `请分析以下客服对话片段，并按JSON格式输出结构化摘要：
1. summary: 1句话概括核心进展
2. factSlots: 
   - who: 交互主体 (如 "给自己买", "给老公买", "给孩子买", "未知")
   - intent: 核心意图 (product_consult, after_sale, logistics, complaint, general)
   - constraints: 明确的偏好和约束数组 (如 ["宽松", "不要黑色", "175cm", "65kg"])
   - decisions: 已达成的决策数组 (如 ["选了M码", "确认退货"])
   - open_questions: 待解决的问题数组

对话片段：
${conversation}

请只返回纯JSON，不要包含Markdown格式，格式如下：
{
  "summary": "...",
  "factSlots": {
    "who": "...",
    "intent": "...",
    "constraints": [],
    "decisions": [],
    "open_questions": []
  }
}`;

    try {
      const response = await this.llmClient!.chat(
        [{ role: 'user', content: prompt, timestamp: '' }],
        { temperature: 0.1, maxTokens: 300 },
      );
      
      let content = response.content.trim();
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\n/, '').replace(/\n```$/, '');
      }
      
      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary || '无摘要',
        factSlots: {
          who: parsed.factSlots?.who || '未知',
          intent: (parsed.factSlots?.intent as WorkflowType) || this.pendingIntent,
          constraints: parsed.factSlots?.constraints || [],
          decisions: parsed.factSlots?.decisions || [],
          open_questions: parsed.factSlots?.open_questions || [],
        }
      };
    } catch (e) {
      console.error('[SegmentCompressor] LLM compression failed, falling back to rules.', e);
      return this.compressWithRules(messages);
    }
  }

  private compressWithRules(messages: Message[]): { summary: string; factSlots: CompressedSegment['factSlots'] } {
    const userMessages = messages.filter((m) => m.role === 'user');
    
    let summary = '(无用户消息)';
    if (userMessages.length > 0) {
      const parts = userMessages.map((m) => {
        return m.content.length > 50 ? m.content.slice(0, 50) + '...' : m.content;
      });
      summary = `用户提到: ${parts.join('; ')}`;
    }

    const allText = messages.map((m) => m.content).join(' ');
    
    let who = '自己';
    if (/(?:帮|给)\s*(?:我\s*)?(?:老公|先生|男朋友)/.test(allText)) who = '老公/男友';
    else if (/(?:帮|给)\s*(?:我\s*)?(?:老婆|女朋友)/.test(allText)) who = '老婆/女友';
    else if (/(?:帮|给)\s*(?:我\s*)?(?:孩子|小孩|儿子|女儿|宝宝)/.test(allText)) who = '孩子';

    const constraints: string[] = [];
    const heightMatch = allText.match(/(?:身高|我)\s*(\d{2,3})\s*(?:cm|厘米)/);
    if (heightMatch) constraints.push(`身高:${heightMatch[1]}`);
    const weightMatch = allText.match(/(?:体重|我)\s*(\d{2,3})\s*(?:斤|kg|公斤)/);
    if (weightMatch) constraints.push(`体重:${weightMatch[1]}`);
    const sizeMatch = allText.match(/(?:我要|给我|选|穿)\s*([A-Z0-9]{1,4})\s*码/i);
    if (sizeMatch) constraints.push(`指定尺码:${sizeMatch[1].toUpperCase()}`);

    return {
      summary,
      factSlots: {
        who,
        intent: this.pendingIntent,
        constraints,
        decisions: [],
        open_questions: [],
      }
    };
  }

  getSegments(): CompressedSegment[] {
    return [...this.segments];
  }

  /**
   * Format all compressed segments for injection into System Prompt.
   * Returns empty string if no segments exist.
   */
  formatForPrompt(): string {
    if (this.segments.length === 0) return '';

    const lines = this.segments.map((s) => {
      const fs = s.factSlots;
      const facts = [];
      if (fs.who && fs.who !== '未知') facts.push(`对象:${fs.who}`);
      if (fs.constraints && fs.constraints.length > 0) facts.push(`约束:[${fs.constraints.join(',')}]`);
      if (fs.decisions && fs.decisions.length > 0) facts.push(`决策:[${fs.decisions.join(',')}]`);
      if (fs.open_questions && fs.open_questions.length > 0) facts.push(`待定:[${fs.open_questions.join(',')}]`);
      
      const factsStr = facts.length > 0 ? ` {${facts.join('; ')}}` : '';
      return `- 第${s.turnRange[0] + 1}-${s.turnRange[1] + 1}轮 (${s.tokenUsage}t): ${s.summary}${factsStr}`;
    });
    return `\n[历史对话摘要]\n${lines.join('\n')}`;
  }

  hasPending(): boolean {
    return this.pendingMessages.length > 0;
  }

  reset(): void {
    this.segments = [];
    this.pendingMessages = [];
    this.turnCounter = 0;
  }
}
