import type { RedisClient } from '../../../infra/adapters/redis.js';
import type { SpecRecommendation } from '../../../domain/types.js';

export class InferenceCache {
  constructor(
    private redis: RedisClient,
    private defaultTTL: number = 3600,
  ) {}

  private buildKey(userId: string, productId: string, profileVersion: number): string {
    return `inference:${userId}:${productId}:${profileVersion}`;
  }

  async get(userId: string, productId: string, profileVersion: number): Promise<SpecRecommendation | null> {
    const key = this.buildKey(userId, productId, profileVersion);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as SpecRecommendation; } catch { return null; }
  }

  async set(
    userId: string, productId: string, profileVersion: number,
    recommendation: SpecRecommendation, ttl?: number,
  ): Promise<void> {
    const key = this.buildKey(userId, productId, profileVersion);
    await this.redis.set(key, JSON.stringify(recommendation), ttl ?? this.defaultTTL);
  }

  async invalidate(userId: string, productId: string, profileVersion: number): Promise<void> {
    await this.redis.del(this.buildKey(userId, productId, profileVersion));
  }
}
