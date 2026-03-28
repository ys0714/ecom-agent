import fs from 'node:fs/promises';
import path from 'node:path';
import type { RedisClient } from '../../infra/adapters/redis.js';
import { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';

export class SessionProfileStore {
  constructor(
    private redis: RedisClient,
    private sessionsDir: string,
  ) {}

  async save(sessionId: string, profile: UserProfileEntity): Promise<void> {
    const data = profile.toJSON();
    const json = JSON.stringify(data);

    // 存入 Redis，设置 24 小时过期
    await this.redis.set(`session_profile:${sessionId}`, json, 86400);

    // 存入会话持久化目录
    await fs.mkdir(this.sessionsDir, { recursive: true });
    const filePath = path.join(this.sessionsDir, `${sessionId}.profile.json`);
    await fs.writeFile(filePath, json, 'utf-8');
  }

  async load(sessionId: string, userId: string): Promise<UserProfileEntity | null> {
    const cached = await this.redis.get(`session_profile:${sessionId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // 确保反序列化后 userId 正确
        parsed.spec.userId = userId;
        return UserProfileEntity.fromJSON(parsed);
      } catch { /* fall through */ }
    }

    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.profile.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      parsed.spec.userId = userId;
      
      const entity = UserProfileEntity.fromJSON(parsed);
      // 回填到 Redis
      await this.redis.set(`session_profile:${sessionId}`, raw, 86400);
      return entity;
    } catch {
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(`session_profile:${sessionId}`);
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.profile.json`);
      await fs.unlink(filePath);
    } catch { /* ignore */ }
  }
}
