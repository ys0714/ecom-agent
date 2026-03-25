import type {
  BadCase, BadCaseSignal, BadCaseTrace, SpecRecommendation, FailureMode,
} from '../../../domain/types.js';
import { v4 as uuid } from 'uuid';

const SIGNAL_WEIGHTS: Record<BadCaseSignal, number> = {
  user_rejection: 1.0,
  spec_override: 0.8,
  transfer_human: 0.9,
  session_timeout: 0.5,
};

/**
 * Diagnose failure modes from trace context.
 * A single badcase can have multiple contributing failure modes.
 */
export function diagnoseFailureModes(trace: BadCaseTrace, signal: BadCaseSignal): FailureMode[] {
  const modes: FailureMode[] = [];

  if (trace.profileCompleteness < 0.3) {
    modes.push('cold_start_insufficient');
  }

  if (trace.specMatchResult.attempted) {
    const topCoverage = trace.specMatchResult.topCandidates[0]?.coverage ?? 0;
    if (topCoverage > 0 && topCoverage < 0.5) {
      modes.push('low_coverage_match');
    }
    if (trace.specMatchResult.topCandidates.length === 0) {
      modes.push('coverage_no_match');
    }
  } else if (!trace.specMatchResult.attempted && !trace.specMatchResult.fallbackToModel) {
    modes.push('coverage_no_match');
  }

  if (trace.specMatchResult.fallbackToModel && signal === 'user_rejection') {
    modes.push('model_fallback_quality');
  }

  if (trace.specMatchResult.selectedSpec && signal === 'user_rejection' && trace.profileCompleteness >= 0.5) {
    modes.push('presentation_issue');
  }

  const profileAge = trace.profileSnapshot
    ? Date.now() - new Date(trace.profileSnapshot.updatedAt).getTime()
    : Infinity;
  if (profileAge > 30 * 24 * 60 * 60 * 1000) {
    modes.push('profile_stale');
  }

  return modes.length > 0 ? modes : ['unknown'];
}

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
    trace: BadCaseTrace,
    recommendation?: SpecRecommendation,
  ): BadCase {
    const failureModes = diagnoseFailureModes(trace, signal);

    const badcase: BadCase = {
      id: uuid(),
      sessionId,
      userId,
      signal,
      weight: SIGNAL_WEIGHTS[signal],
      context: { userMessage, agentResponse, recommendedSpec: recommendation },
      trace,
      failureModes,
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
