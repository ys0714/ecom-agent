import type { ModelType, ModelProvider as ProviderConfig, ModelConfig, HealthStatus, Message } from '../../../domain/types.js';
import type { LLMClient } from '../../../infra/adapters/llm.js';
import { ResilientModelProvider } from './model-provider.js';
import { InMemoryEventBus, createEvent } from '../../../domain/event-bus.js';

interface SlotEntry {
  slotId: string;
  modelType: ModelType;
  primary: ResilientModelProvider;
  fallback?: ResilientModelProvider;
  config: ModelConfig;
}

export class ModelSlotManager {
  private slots = new Map<string, SlotEntry>();

  constructor(
    private eventBus: InMemoryEventBus,
    private clientFactory: (cfg: ProviderConfig) => LLMClient,
  ) {}

  registerSlot(
    slotId: string,
    modelType: ModelType,
    provider: ProviderConfig,
    config: ModelConfig,
    fallbackProvider?: ProviderConfig,
  ): void {
    const primary = new ResilientModelProvider(
      this.clientFactory(provider), provider,
      { maxRetries: config.maxRetries, retryDelayMs: config.retryDelayMs },
    );
    const fallback = fallbackProvider
      ? new ResilientModelProvider(this.clientFactory(fallbackProvider), fallbackProvider, { maxRetries: 1 })
      : undefined;

    this.slots.set(slotId, { slotId, modelType, primary, fallback, config });
  }

  unregisterSlot(slotId: string): void {
    this.slots.delete(slotId);
  }

  switchProvider(slotId: string, newProvider: ProviderConfig): void {
    const slot = this.slots.get(slotId);
    if (!slot) throw new Error(`Slot ${slotId} not found`);
    slot.primary = new ResilientModelProvider(
      this.clientFactory(newProvider), newProvider,
      { maxRetries: slot.config.maxRetries, retryDelayMs: slot.config.retryDelayMs },
    );
  }

  async infer(slotId: string, messages: Message[], sessionId?: string, tools?: any[]): Promise<import('../../../infra/adapters/llm.js').ChatResponse> {
    const slot = this.slots.get(slotId);
    if (!slot) throw new Error(`Slot ${slotId} not found`);

    const startTime = Date.now();
    try {
      const result = await slot.primary.infer(messages, tools);
      this.eventBus.publish(createEvent('model:inference', {
        slotId, model: slot.primary.modelId, latencyMs: Date.now() - startTime,
      }, sessionId));
      return result;
    } catch (primaryErr) {
      if (slot.fallback) {
        this.eventBus.publish(createEvent('model:fallback', {
          slotId, from: slot.primary.modelId, to: slot.fallback.modelId,
          reason: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
        }, sessionId));

        const result = await slot.fallback.infer(messages, tools);
        this.eventBus.publish(createEvent('model:inference', {
          slotId, model: slot.fallback.modelId, latencyMs: Date.now() - startTime, isFallback: true,
        }, sessionId));
        return result;
      }
      throw primaryErr;
    }
  }

  listSlots(): Array<{ slotId: string; modelType: ModelType; primaryModel: string }> {
    return [...this.slots.values()].map((s) => ({
      slotId: s.slotId, modelType: s.modelType, primaryModel: s.primary.modelId,
    }));
  }
}
