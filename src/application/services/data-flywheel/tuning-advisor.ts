import type { FailureMode } from '../../../domain/types.js';
import type { FailureModeCluster } from './badcase-analyzer.js';
import type { ConfigWatchSubscriber } from '../../subscribers/config-watch-subscriber.js';

export interface TuningRecommendation {
  knob: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

type KnobRegistry = Record<string, { getValue: () => unknown }>;

export class TuningAdvisor {
  constructor(private knobs: KnobRegistry) {}

  recommend(topCluster: FailureModeCluster): TuningRecommendation | null {
    const { mode, percentage } = topCluster;
    const confidence = percentage > 30 ? 'high' : percentage > 15 ? 'medium' : 'low';

    switch (mode) {
      case 'low_coverage_match':
        return {
          knob: 'FEATURE_PRIORITY',
          currentValue: this.knobs['FEATURE_PRIORITY']?.getValue() ?? 'unknown',
          suggestedValue: 'Reorder features: prioritize weight/height with higher weight for the dominant category in badcases',
          reason: `${percentage}% of badcases have low coverage scores — feature priority may not match user population`,
          confidence,
        };

      case 'cold_start_insufficient':
        return {
          knob: 'COMPLETENESS_THRESHOLDS.warm',
          currentValue: this.knobs['COMPLETENESS_THRESHOLDS']?.getValue() ?? 0.3,
          suggestedValue: 0.2,
          reason: `${percentage}% of badcases from cold-start users — lower the warm threshold to be less aggressive with recommendations`,
          confidence,
        };

      case 'presentation_issue': {
        const current = this.knobs['MIN_RECOMMEND_CONFIDENCE']?.getValue() ?? 0.5;
        return {
          knob: 'MIN_RECOMMEND_CONFIDENCE',
          currentValue: current,
          suggestedValue: Math.min(0.9, (current as number) + 0.1),
          reason: `${percentage}% of badcases where correct spec was recommended but user rejected — raise confidence threshold to be more conservative`,
          confidence,
        };
      }

      case 'coverage_no_match':
        return {
          knob: 'MATCH_RANGE_EXPANSION',
          currentValue: 'strict',
          suggestedValue: 'relaxed (expand user range by ±5%)',
          reason: `${percentage}% of badcases had no coverage match — consider relaxing range boundaries`,
          confidence,
        };

      case 'model_fallback_quality':
        return {
          knob: 'MODEL_SLOT / PROMPT_VERSION',
          currentValue: 'current',
          suggestedValue: 'Review model quality or update prompt for fallback scenarios',
          reason: `${percentage}% of badcases from model fallback path — model inference quality needs improvement`,
          confidence,
        };

      case 'profile_stale':
        return {
          knob: 'PROFILE_UPDATE_FREQUENCY',
          currentValue: 'T+1',
          suggestedValue: 'Consider real-time update on conversation signals',
          reason: `${percentage}% of badcases have profiles older than 30 days`,
          confidence,
        };

      default:
        return null;
    }
  }

  async apply(recommendation: TuningRecommendation, configWatch: ConfigWatchSubscriber): Promise<boolean> {
    if (recommendation.confidence === 'low') return false; // Too risky to auto-apply
    
    // Only apply numeric or boolean values automatically (not complex strings/objects)
    if (typeof recommendation.suggestedValue === 'number' || typeof recommendation.suggestedValue === 'boolean') {
      await configWatch.applyChange(
        recommendation.knob,
        recommendation.suggestedValue,
        recommendation.currentValue,
        'tuning_advisor'
      );
      return true;
    }
    
    return false;
  }
}
