import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType } from '../../domain/types.js';

export interface AlertConfig {
  consecutiveFallbackThreshold: number;
  webhookUrl?: string;
}

export interface Alert {
  level: 'warning' | 'critical';
  message: string;
  timestamp: string;
  event: AgentEvent;
}

export class AlertSubscriber implements EventSubscriber {
  readonly name = 'AlertSubscriber';
  readonly priority = 'critical' as const;
  readonly subscribedEvents: AgentEventType[] = [
    'model:fallback', 'system:error', 'guardrail:blocked',
  ];

  private consecutiveFallbacks = 0;
  private alerts: Alert[] = [];

  constructor(private config: AlertConfig = { consecutiveFallbackThreshold: 3 }) {}

  handle(event: AgentEvent): void {
    switch (event.type) {
      case 'model:fallback':
        this.consecutiveFallbacks++;
        if (this.consecutiveFallbacks >= this.config.consecutiveFallbackThreshold) {
          this.emit('critical', `连续 ${this.consecutiveFallbacks} 次模型降级`, event);
        }
        break;
      case 'system:error':
        this.emit('critical', `系统错误: ${event.payload.error}`, event);
        this.consecutiveFallbacks = 0;
        break;
      case 'guardrail:blocked':
        this.emit('warning', `安全护栏拦截: ${event.payload.reason}`, event);
        break;
    }
  }

  onError(error: Error, event: AgentEvent): void {
    console.error(`[AlertSubscriber] self error on ${event.type}:`, error.message);
  }

  private emit(level: Alert['level'], message: string, event: AgentEvent): void {
    const alert: Alert = { level, message, timestamp: new Date().toISOString(), event };
    this.alerts.push(alert);
    console.warn(`[ALERT:${level}] ${message}`);
  }

  resetFallbackCounter(): void {
    this.consecutiveFallbacks = 0;
  }

  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  clearAlerts(): void {
    this.alerts.length = 0;
  }
}
