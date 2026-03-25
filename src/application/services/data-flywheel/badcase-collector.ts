import type { BadCase, AgentEvent, SpecRecommendation } from '../../../domain/types.js';
import { v4 as uuid } from 'uuid';

export type BadCaseSignal = 'user_rejection' | 'spec_override' | 'session_timeout' | 'transfer_human';

const SIGNAL_WEIGHTS: Record<BadCaseSignal, number> = {
  user_rejection: 1.0,
  spec_override: 0.8,
  transfer_human: 0.9,
  session_timeout: 0.5,
};

export class BadCaseCollector {
  private pool: BadCase[] = [];
  private batchThreshold: number;

  constructor(batchThreshold: number = 50) {
    this.batchThreshold = batchThreshold;
  }

  collect(
    signal: BadCaseSignal,
    sessionId: string,
    userId: string,
    userMessage: string,
    agentResponse: string,
    recommendation?: SpecRecommendation,
  ): BadCase {
    const badcase: BadCase = {
      id: uuid(),
      sessionId,
      userId,
      signal,
      weight: SIGNAL_WEIGHTS[signal],
      context: { userMessage, agentResponse, recommendedSpec: recommendation },
      detectedAt: new Date().toISOString(),
    };
    this.pool.push(badcase);
    return badcase;
  }

  isReadyForAnalysis(): boolean {
    return this.pool.length >= this.batchThreshold;
  }

  drainPool(): BadCase[] {
    const batch = [...this.pool];
    this.pool = [];
    return batch;
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  setBatchThreshold(n: number): void {
    this.batchThreshold = n;
  }
}
