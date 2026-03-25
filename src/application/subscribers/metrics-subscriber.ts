import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType } from '../../domain/types.js';

export interface MetricsSnapshot {
  inferenceCount: number;
  inferenceLatencySum: number;
  fallbackCount: number;
  guardrailBlockCount: number;
  errorCount: number;
}

export class MetricsSubscriber implements EventSubscriber {
  readonly name = 'MetricsSubscriber';
  readonly priority = 'normal' as const;
  readonly subscribedEvents: AgentEventType[] = [
    'model:inference', 'model:fallback',
    'guardrail:blocked', 'system:error',
  ];

  private metrics: MetricsSnapshot = {
    inferenceCount: 0, inferenceLatencySum: 0,
    fallbackCount: 0, guardrailBlockCount: 0, errorCount: 0,
  };

  handle(event: AgentEvent): void {
    switch (event.type) {
      case 'model:inference':
        this.metrics.inferenceCount++;
        this.metrics.inferenceLatencySum += (event.payload.latencyMs as number) ?? 0;
        break;
      case 'model:fallback':
        this.metrics.fallbackCount++;
        break;
      case 'guardrail:blocked':
        this.metrics.guardrailBlockCount++;
        break;
      case 'system:error':
        this.metrics.errorCount++;
        break;
    }
  }

  getSnapshot(): MetricsSnapshot & { avgLatencyMs: number } {
    return {
      ...this.metrics,
      avgLatencyMs: this.metrics.inferenceCount > 0
        ? Math.round(this.metrics.inferenceLatencySum / this.metrics.inferenceCount)
        : 0,
    };
  }

  reset(): void {
    this.metrics = {
      inferenceCount: 0, inferenceLatencySum: 0,
      fallbackCount: 0, guardrailBlockCount: 0, errorCount: 0,
    };
  }
}
