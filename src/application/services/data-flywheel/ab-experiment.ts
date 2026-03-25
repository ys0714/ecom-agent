import type { SuccessSignal } from '../../../domain/types.js';

export interface ExperimentConfig {
  id: string;
  controlPromptId: string;
  treatmentPromptId: string;
  trafficRatio: number;
  minSampleSize: number;
  startedAt: string;
  status: 'running' | 'concluded' | 'rolled_back';
}

export interface ExperimentOutcome {
  isControl: boolean;
  signal: SuccessSignal | 'spec_rejected';
}

export interface ExperimentMetrics {
  controlSamples: number;
  treatmentSamples: number;
  controlSuccessRate: number;
  treatmentSuccessRate: number;
  controlAcceptCount: number;
  treatmentAcceptCount: number;
  controlPurchaseCount: number;
  treatmentPurchaseCount: number;
}

export class ABExperiment {
  private experiments = new Map<string, ExperimentConfig>();
  private metrics = new Map<string, ExperimentMetrics>();

  create(config: ExperimentConfig): void {
    this.experiments.set(config.id, config);
    this.metrics.set(config.id, {
      controlSamples: 0, treatmentSamples: 0,
      controlSuccessRate: 0, treatmentSuccessRate: 0,
      controlAcceptCount: 0, treatmentAcceptCount: 0,
      controlPurchaseCount: 0, treatmentPurchaseCount: 0,
    });
  }

  recordOutcome(experimentId: string, outcome: ExperimentOutcome): void {
    const m = this.metrics.get(experimentId);
    if (!m) return;

    const isSuccess = outcome.signal === 'spec_accepted'
      || outcome.signal === 'spec_not_changed'
      || outcome.signal === 'session_purchase';

    const isAccept = outcome.signal === 'spec_accepted' || outcome.signal === 'spec_not_changed';
    const isPurchase = outcome.signal === 'session_purchase';

    if (outcome.isControl) {
      m.controlSamples++;
      if (isAccept) m.controlAcceptCount++;
      if (isPurchase) m.controlPurchaseCount++;
      m.controlSuccessRate = (m.controlAcceptCount + m.controlPurchaseCount) / m.controlSamples;
    } else {
      m.treatmentSamples++;
      if (isAccept) m.treatmentAcceptCount++;
      if (isPurchase) m.treatmentPurchaseCount++;
      m.treatmentSuccessRate = (m.treatmentAcceptCount + m.treatmentPurchaseCount) / m.treatmentSamples;
    }
  }

  evaluate(experimentId: string): 'promote' | 'rollback' | 'continue' {
    const config = this.experiments.get(experimentId);
    const m = this.metrics.get(experimentId);
    if (!config || !m) return 'continue';

    const totalSamples = m.controlSamples + m.treatmentSamples;
    if (totalSamples < config.minSampleSize) return 'continue';

    const diff = m.treatmentSuccessRate - m.controlSuccessRate;
    const se = Math.sqrt(
      (m.controlSuccessRate * (1 - m.controlSuccessRate) / Math.max(m.controlSamples, 1)) +
      (m.treatmentSuccessRate * (1 - m.treatmentSuccessRate) / Math.max(m.treatmentSamples, 1))
    );
    const zScore = se > 0 ? diff / se : 0;

    if (zScore > 1.96) return 'promote';
    if (zScore < -1.96) return 'rollback';
    return 'continue';
  }

  getExperiment(id: string): ExperimentConfig | undefined {
    return this.experiments.get(id);
  }

  getMetrics(id: string): ExperimentMetrics | undefined {
    return this.metrics.get(id);
  }
}
