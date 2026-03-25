import type { PreferenceSignal } from './preference-detector.js';

export type ArbitrationDecision = 'accept' | 'merge' | 'ignore';

const ACCEPT_MULTIPLIER = 1.2;
const MERGE_MULTIPLIER = 0.8;

export interface ArbitrationResult {
  decision: ArbitrationDecision;
  effectiveConfidence: number;
  reason: string;
}

/**
 * Arbitrate between an incoming conversation signal and existing profile confidence.
 *
 * Rules:
 * - explicit_override → always accept (user explicitly stated preference)
 * - incoming.confidence > existing * 1.2 → accept (significantly stronger signal)
 * - incoming.confidence > existing * 0.8 → merge (comparable strength, blend)
 * - otherwise → ignore (existing profile is more reliable)
 */
export function arbitrate(existingConfidence: number, incoming: PreferenceSignal): ArbitrationResult {
  if (incoming.type === 'explicit_override') {
    return {
      decision: 'accept',
      effectiveConfidence: 1.0,
      reason: '用户明确指定，直接采纳',
    };
  }

  if (incoming.type === 'none') {
    return {
      decision: 'ignore',
      effectiveConfidence: existingConfidence,
      reason: '无覆写信号',
    };
  }

  if (incoming.confidence > existingConfidence * ACCEPT_MULTIPLIER) {
    return {
      decision: 'accept',
      effectiveConfidence: incoming.confidence,
      reason: `对话信号(${incoming.confidence.toFixed(2)})显著强于画像(${existingConfidence.toFixed(2)})`,
    };
  }

  if (incoming.confidence > existingConfidence * MERGE_MULTIPLIER) {
    const blended = (existingConfidence + incoming.confidence) / 2;
    return {
      decision: 'merge',
      effectiveConfidence: blended,
      reason: `信号接近，合并置信度: ${blended.toFixed(2)}`,
    };
  }

  return {
    decision: 'ignore',
    effectiveConfidence: existingConfidence,
    reason: `对话信号(${incoming.confidence.toFixed(2)})弱于画像(${existingConfidence.toFixed(2)})，保留画像`,
  };
}

/**
 * Apply feedback to adjust confidence.
 * Positive feedback (user accepted) → boost.
 * Negative feedback (user overrode) → reduce.
 */
export function adjustConfidence(current: number, feedback: 'positive' | 'negative'): number {
  const delta = feedback === 'positive' ? 0.1 : -0.1;
  return Math.max(0, Math.min(1, current + delta));
}
