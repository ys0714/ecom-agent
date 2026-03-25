export interface ExperimentConfig {
  id: string;
  controlPromptId: string;
  treatmentPromptId: string;
  trafficRatio: number;
  minSampleSize: number;
  startedAt: string;
  status: 'running' | 'concluded' | 'rolled_back';
}

export interface ExperimentMetrics {
  controlSamples: number;
  treatmentSamples: number;
  controlSuccessRate: number;
  treatmentSuccessRate: number;
}

export class ABExperiment {
  private experiments = new Map<string, ExperimentConfig>();
  private metrics = new Map<string, ExperimentMetrics>();

  create(config: ExperimentConfig): void {
    this.experiments.set(config.id, config);
    this.metrics.set(config.id, {
      controlSamples: 0, treatmentSamples: 0,
      controlSuccessRate: 0, treatmentSuccessRate: 0,
    });
  }

  recordOutcome(experimentId: string, isControl: boolean, success: boolean): void {
    const m = this.metrics.get(experimentId);
    if (!m) return;

    if (isControl) {
      m.controlSamples++;
      m.controlSuccessRate = this.updateRate(m.controlSuccessRate, m.controlSamples, success);
    } else {
      m.treatmentSamples++;
      m.treatmentSuccessRate = this.updateRate(m.treatmentSuccessRate, m.treatmentSamples, success);
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

  private updateRate(currentRate: number, totalSamples: number, success: boolean): number {
    return ((currentRate * (totalSamples - 1)) + (success ? 1 : 0)) / totalSamples;
  }
}
