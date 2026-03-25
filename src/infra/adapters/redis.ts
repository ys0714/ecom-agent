import IORedisLib from 'ioredis';
const Redis = IORedisLib.default ?? IORedisLib;

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  jsonGet(key: string, path?: string): Promise<unknown | null>;
  jsonSet(key: string, path: string, value: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

export class IORedisClient implements RedisClient {
  private client: InstanceType<typeof Redis>;

  constructor(url: string) {
    this.client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async jsonGet(key: string, path = '$'): Promise<unknown | null> {
    const raw = await this.client.call('JSON.GET', key, path) as string | null;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      return null;
    }
  }

  async jsonSet(key: string, path: string, value: unknown): Promise<void> {
    await this.client.call('JSON.SET', key, path, JSON.stringify(value));
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * In-memory Redis mock for testing and development without Redis server.
 */
export class InMemoryRedisClient implements RedisClient {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async jsonGet(key: string, _path = '$'): Promise<unknown | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  async jsonSet(key: string, _path: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value));
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

export function createRedisClient(url: string): RedisClient {
  if (url === 'memory://' || process.env.NODE_ENV === 'test') {
    return new InMemoryRedisClient();
  }
  return new IORedisClient(url);
}
