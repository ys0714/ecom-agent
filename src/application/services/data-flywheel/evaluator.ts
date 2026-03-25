import type { BadCase, SpecRecommendation, SuccessSignal } from '../../../domain/types.js';

export interface EvaluationMetrics {
  totalRecommendations: number;
  specAccepted: number;
  specOverridden: number;
  coverageHit: number;
  coverageMiss: number;
  modelFallback: number;

  accuracyRate: number;         // specAccepted / total
  acceptRate: number;           // (specAccepted + specNotChanged) / total
  coverageHitRate: number;      // coverageHit / total
  fallbackRate: number;         // modelFallback / total
}

interface RecommendationOutcome {
  recommendation: SpecRecommendation;
  outcome: SuccessSignal | 'spec_rejected';
  actualPurchasedSpec?: string;
}

export class SpecRecommendationEvaluator {
  private outcomes: RecommendationOutcome[] = [];

  recordOutcome(
    recommendation: SpecRecommendation,
    outcome: SuccessSignal | 'spec_rejected',
    actualPurchasedSpec?: string,
  ): void {
    this.outcomes.push({ recommendation, outcome, actualPurchasedSpec });
  }

  evaluate(): EvaluationMetrics {
    const total = this.outcomes.length;
    if (total === 0) {
      return {
        totalRecommendations: 0, specAccepted: 0, specOverridden: 0,
        coverageHit: 0, coverageMiss: 0, modelFallback: 0,
        accuracyRate: 0, acceptRate: 0, coverageHitRate: 0, fallbackRate: 0,
      };
    }

    let specAccepted = 0;
    let specNotChanged = 0;
    let specOverridden = 0;
    let coverageHit = 0;
    let modelFallback = 0;

    for (const o of this.outcomes) {
      if (o.outcome === 'spec_accepted') specAccepted++;
      if (o.outcome === 'spec_not_changed') specNotChanged++;
      if (o.outcome === 'spec_rejected') specOverridden++;
      if (o.recommendation.matchMethod === 'coverage') coverageHit++;
      if (o.recommendation.matchMethod === 'model_inference') modelFallback++;
    }

    return {
      totalRecommendations: total,
      specAccepted,
      specOverridden,
      coverageHit,
      coverageMiss: total - coverageHit,
      modelFallback,
      accuracyRate: Math.round((specAccepted / total) * 100) / 100,
      acceptRate: Math.round(((specAccepted + specNotChanged) / total) * 100) / 100,
      coverageHitRate: Math.round((coverageHit / total) * 100) / 100,
      fallbackRate: Math.round((modelFallback / total) * 100) / 100,
    };
  }

  hasRegressionFrom(baseline: EvaluationMetrics, thresholdPct: number = 5): string[] {
    const current = this.evaluate();
    const regressions: string[] = [];

    if (baseline.accuracyRate > 0 && current.accuracyRate < baseline.accuracyRate * (1 - thresholdPct / 100)) {
      regressions.push(`accuracyRate: ${baseline.accuracyRate} → ${current.accuracyRate}`);
    }
    if (baseline.acceptRate > 0 && current.acceptRate < baseline.acceptRate * (1 - thresholdPct / 100)) {
      regressions.push(`acceptRate: ${baseline.acceptRate} → ${current.acceptRate}`);
    }
    if (baseline.coverageHitRate > 0 && current.coverageHitRate < baseline.coverageHitRate * (1 - thresholdPct / 100)) {
      regressions.push(`coverageHitRate: ${baseline.coverageHitRate} → ${current.coverageHitRate}`);
    }

    return regressions;
  }

  reset(): void {
    this.outcomes = [];
  }

  getOutcomeCount(): number {
    return this.outcomes.length;
  }
}
