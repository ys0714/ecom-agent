import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType } from '../../domain/types.js';
import { BadCaseAnalyzer } from '../services/data-flywheel/badcase-analyzer.js';
import type { BadCaseCollector } from '../services/data-flywheel/badcase-collector.js';
import type { TuningAdvisor } from '../services/data-flywheel/tuning-advisor.js';
import type { ConfigWatchSubscriber } from './config-watch-subscriber.js';

export class AutoPromptSubscriber implements EventSubscriber {
  readonly name = 'AutoPromptSubscriber';
  readonly priority = 'low' as const;
  readonly subscribedEvents: AgentEventType[] = ['badcase:detected'];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private collector: BadCaseCollector,
    private analyzer: BadCaseAnalyzer,
    private advisor: TuningAdvisor,
    private configWatch: ConfigWatchSubscriber
  ) {
    // Run flywheel analysis weekly even if we haven't reached the batch threshold
    // (In production this would be a cron job, here we use setInterval for 7 days)
    this.timer = setInterval(() => {
      this.runFlywheel().catch(console.error);
    }, 7 * 24 * 60 * 60 * 1000);
  }

  handle(event: AgentEvent): void {
    // Check if we have enough badcases
    if (this.collector.isReadyForAnalysis()) {
      this.runFlywheel().catch(console.error);
    }
  }

  async runFlywheel(): Promise<void> {
    const pool = this.collector.drainPool();
    if (pool.length === 0) return;

    const clusters = this.analyzer.analyze(pool);
    if (clusters.length === 0) return;

    const topCluster = clusters[0];
    const recommendation = this.advisor.recommend(topCluster);
    if (!recommendation) return;

    await this.advisor.apply(recommendation, this.configWatch);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
