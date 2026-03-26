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
  private segmentSize: number;
  private llmClient?: LLMClient;

  constructor(opts: SegmentCompressorOpts = {}) {
    this.segmentSize = opts.segmentSize ?? DEFAULT_SEGMENT_SIZE;
    this.llmClient = opts.llmClient;
  }

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

    while (this.pendingMessages.length >= this.segmentSize) {
      const batch = this.pendingMessages.splice(0, this.segmentSize);
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

    const segment: CompressedSegment = {
      segmentIndex: this.segments.length,
      turnRange: [startTurn, endTurn],
      summary: await this.compress(batch),
      keyFacts: this.extractKeyFacts(batch),
      intent: this.pendingIntent,
    };

    this.segments.push(segment);
  }

  private async compress(messages: Message[]): Promise<string> {
    if (this.llmClient) {
      return this.compressWithLLM(messages);
    }
    return this.compressWithRules(messages);
  }

  private async compressWithLLM(messages: Message[]): Promise<string> {
    const conversation = messages
      .map((m) => `${m.role === 'user' ? '用户' : '客服'}: ${m.content}`)
      .join('\n');

    const prompt = `请用1-2句话概括以下客服对话片段的核心内容，保留关键的尺码、体型、商品偏好等信息：

${conversation}

摘要：`;

    try {
      const result = await this.llmClient!.chat(
        [{ role: 'user', content: prompt, timestamp: '' }],
        { temperature: 0.1, maxTokens: 150 },
      );
      return result.trim() || this.compressWithRules(messages);
    } catch {
      return this.compressWithRules(messages);
    }
  }

  private compressWithRules(messages: Message[]): string {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return '(无用户消息)';

    const parts = userMessages.map((m) => {
      const content = m.content.length > 50 ? m.content.slice(0, 50) + '...' : m.content;
      return content;
    });
    return `用户提到: ${parts.join('; ')}`;
  }

  private extractKeyFacts(messages: Message[]): string[] {
    const facts: string[] = [];
    const allText = messages.map((m) => m.content).join(' ');

    const rolePatterns: Array<{ pattern: RegExp; fact: string }> = [
      { pattern: /(?:帮|给)\s*(?:我\s*)?(?:老公|先生|男朋友)/, fact: '角色切换:male' },
      { pattern: /(?:帮|给)\s*(?:我\s*)?(?:老婆|女朋友)/, fact: '角色切换:female' },
      { pattern: /(?:帮|给)\s*(?:我\s*)?(?:孩子|小孩|儿子|女儿|宝宝)/, fact: '角色切换:child' },
    ];
    for (const { pattern, fact } of rolePatterns) {
      if (pattern.test(allText)) facts.push(fact);
    }

    const heightMatch = allText.match(/(?:身高|我)\s*(\d{2,3})\s*(?:cm|厘米)/);
    if (heightMatch) facts.push(`身高:${heightMatch[1]}`);

    const weightMatch = allText.match(/(?:体重|我)\s*(\d{2,3})\s*(?:斤|kg|公斤)/);
    if (weightMatch) facts.push(`体重:${weightMatch[1]}`);

    const sizeMatch = allText.match(/(?:我要|给我|选|穿)\s*([A-Z0-9]{1,4})\s*码/i);
    if (sizeMatch) facts.push(`指定尺码:${sizeMatch[1].toUpperCase()}`);

    const productMatch = allText.match(/\bp(\d+)\b/i);
    if (productMatch) facts.push(`商品:p${productMatch[1]}`);

    return facts;
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

    const lines = this.segments.map((s) =>
      `- 第${s.turnRange[0] + 1}-${s.turnRange[1] + 1}轮: ${s.summary}${s.keyFacts.length > 0 ? ` [${s.keyFacts.join(', ')}]` : ''}`
    );
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
