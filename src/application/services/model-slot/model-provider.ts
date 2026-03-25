import {
  ConsecutiveBreaker, ExponentialBackoff,
  retry, handleAll, wrap, timeout, TimeoutStrategy,
  circuitBreaker,
} from 'cockatiel';
import type { LLMClient } from '../../../infra/adapters/llm.js';
import type { Message, ModelProvider as ModelProviderConfig } from '../../../domain/types.js';

export class ResilientModelProvider {
  private policy;

  constructor(
    private client: LLMClient,
    private config: ModelProviderConfig,
    opts?: { maxRetries?: number; retryDelayMs?: number; circuitThreshold?: number },
  ) {
    const retryPolicy = retry(handleAll, {
      maxAttempts: opts?.maxRetries ?? 3,
      backoff: new ExponentialBackoff({ initialDelay: opts?.retryDelayMs ?? 200 }),
    });

    const timeoutPolicy = timeout(config.timeoutMs, TimeoutStrategy.Aggressive);

    const breakerPolicy = circuitBreaker(handleAll, {
      halfOpenAfter: 30_000,
      breaker: new ConsecutiveBreaker(opts?.circuitThreshold ?? 5),
    });

    this.policy = wrap(retryPolicy, breakerPolicy, timeoutPolicy);
  }

  get name(): string {
    return this.config.name;
  }

  get modelId(): string {
    return this.config.modelId;
  }

  async infer(messages: Message[]): Promise<string> {
    return this.policy.execute(() =>
      this.client.chat(messages, {
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      })
    );
  }
}
