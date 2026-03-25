import fs from 'node:fs/promises';
import path from 'node:path';
import type { RedisClient } from '../../infra/adapters/redis.js';
import { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';

export class ProfileStore {
  constructor(
    private redis: RedisClient,
    private profilesDir: string,
  ) {}

  async save(entity: UserProfileEntity): Promise<void> {
    const data = entity.toJSON();
    const json = JSON.stringify(data);

    await this.redis.set(`profile:${entity.userId}`, json);

    await fs.mkdir(this.profilesDir, { recursive: true });
    const filePath = path.join(this.profilesDir, `${entity.userId}.json`);
    await fs.writeFile(filePath, json, 'utf-8');
  }

  async load(userId: string): Promise<UserProfileEntity | null> {
    const cached = await this.redis.get(`profile:${userId}`);
    if (cached) {
      try {
        return UserProfileEntity.fromJSON(JSON.parse(cached));
      } catch { /* fall through to file */ }
    }

    try {
      const filePath = path.join(this.profilesDir, `${userId}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      const entity = UserProfileEntity.fromJSON(JSON.parse(raw));
      await this.redis.set(`profile:${userId}`, raw);
      return entity;
    } catch {
      return null;
    }
  }

  async delete(userId: string): Promise<void> {
    await this.redis.del(`profile:${userId}`);
    try {
      const filePath = path.join(this.profilesDir, `${userId}.json`);
      await fs.unlink(filePath);
    } catch { /* file may not exist */ }
  }

  async exists(userId: string): Promise<boolean> {
    return this.redis.exists(`profile:${userId}`);
  }
}
