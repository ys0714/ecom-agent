export interface ABConfig {
  experimentId: string;
  treatmentRatio: number;  // 0~1, fraction routed to treatment
  controlSlotId: string;
  treatmentSlotId: string;
}

export class ABRouter {
  private configs = new Map<string, ABConfig>();

  addExperiment(config: ABConfig): void {
    this.configs.set(config.experimentId, config);
  }

  removeExperiment(experimentId: string): void {
    this.configs.delete(experimentId);
  }

  /**
   * Determine which slot to use for a given user in a given experiment.
   * Uses deterministic hashing so the same user always gets the same bucket.
   */
  route(experimentId: string, userId: string): string {
    const config = this.configs.get(experimentId);
    if (!config) throw new Error(`Experiment ${experimentId} not found`);

    const hash = this.hashUser(userId, experimentId);
    return hash < config.treatmentRatio ? config.treatmentSlotId : config.controlSlotId;
  }

  routeAny(userId: string): { experimentId: string; slotId: string } | null {
    for (const [expId, config] of this.configs) {
      const hash = this.hashUser(userId, expId);
      if (hash < config.treatmentRatio) {
        return { experimentId: expId, slotId: config.treatmentSlotId };
      }
    }
    return null;
  }

  listExperiments(): ABConfig[] {
    return [...this.configs.values()];
  }

  private hashUser(userId: string, seed: string): number {
    let hash = 0;
    const str = `${userId}:${seed}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash) / 2147483647;
  }
}
