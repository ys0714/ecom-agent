import type { BadCase, FailureMode } from '../../../domain/types.js';

export interface FailureModeCluster {
  mode: FailureMode;
  cases: BadCase[];
  count: number;
  percentage: number;
  suggestedKnob: string;
}

const KNOB_MAP: Record<FailureMode, string> = {
  cold_start_insufficient: 'COMPLETENESS_THRESHOLDS',
  low_coverage_match: 'FEATURE_PRIORITY',
  coverage_no_match: 'MATCH_RANGE_EXPANSION',
  model_fallback_quality: 'MODEL_QUALITY / PROMPT',
  presentation_issue: 'MIN_RECOMMEND_CONFIDENCE / PROMPT_WORDING',
  profile_stale: 'PROFILE_UPDATE_FREQUENCY',
  unknown: 'MANUAL_REVIEW',
};

/**
 * Analyze badcases by their pre-diagnosed failure modes.
 * Each badcase may contribute to multiple clusters (multi-dimensional attribution).
 */
export class BadCaseAnalyzer {
  analyze(badcases: BadCase[]): FailureModeCluster[] {
    const groups = new Map<FailureMode, BadCase[]>();

    for (const bc of badcases) {
      for (const mode of bc.failureModes) {
        const list = groups.get(mode) ?? [];
        list.push(bc);
        groups.set(mode, list);
      }
    }

    const total = badcases.length;
    return [...groups.entries()]
      .map(([mode, cases]) => ({
        mode,
        cases,
        count: cases.length,
        percentage: Math.round((cases.length / Math.max(total, 1)) * 100),
        suggestedKnob: KNOB_MAP[mode],
      }))
      .sort((a, b) => b.count - a.count);
  }

  getTopFailureMode(badcases: BadCase[]): FailureModeCluster | null {
    const clusters = this.analyze(badcases);
    return clusters.length > 0 ? clusters[0] : null;
  }
}
