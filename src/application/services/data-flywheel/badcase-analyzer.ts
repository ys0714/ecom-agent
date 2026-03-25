import type { BadCase } from '../../../domain/types.js';

export type FailureMode = 'spec_mismatch' | 'profile_inaccurate' | 'tone_inappropriate' | 'context_lost' | 'unknown';

export interface BadCaseCluster {
  mode: FailureMode;
  cases: BadCase[];
  count: number;
}

const SIGNAL_TO_MODE: Record<string, FailureMode> = {
  spec_override: 'spec_mismatch',
  user_rejection: 'profile_inaccurate',
  transfer_human: 'tone_inappropriate',
  session_timeout: 'context_lost',
};

export class BadCaseAnalyzer {
  clusterByRules(badcases: BadCase[]): BadCaseCluster[] {
    const groups = new Map<FailureMode, BadCase[]>();

    for (const bc of badcases) {
      const mode = SIGNAL_TO_MODE[bc.signal] ?? 'unknown';
      const list = groups.get(mode) ?? [];
      list.push(bc);
      groups.set(mode, list);
    }

    return [...groups.entries()]
      .map(([mode, cases]) => ({ mode, cases, count: cases.length }))
      .sort((a, b) => b.count - a.count);
  }
}
