import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileDimensionRegistry } from '../../src/application/services/profile-engine/dimension-registry.js';
import { ColdStartManager } from '../../src/application/services/profile-engine/cold-start-manager.js';
import { ProfileStore } from '../../src/application/services/profile-store.js';
import { InMemoryRedisClient } from '../../src/infra/adapters/redis.js';
import { UserProfileEntity } from '../../src/domain/entities/user-profile.entity.js';
import type { ProfileDimensionPlugin, DimensionData, DimensionDelta, Message } from '../../src/domain/types.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('ProfileStore', () => {
  let store: ProfileStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `profile-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new ProfileStore(new InMemoryRedisClient(), tmpDir);
  });

  it('save + load roundtrip', async () => {
    const entity = new UserProfileEntity('u_store', {
      femaleClothing: {
        weight: [100, 110], height: [160, 170],
        waistline: null, bust: null, footLength: null,
        size: ['M'], bottomSize: null, shoeSize: null,
      },
    });

    await store.save(entity);
    const loaded = await store.load('u_store');
    expect(loaded).not.toBeNull();
    expect(loaded!.userId).toBe('u_store');
    expect(loaded!.getGenderProfile('female')?.weight).toEqual([100, 110]);
  });

  it('returns null for non-existent user', async () => {
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('delete removes from cache and disk', async () => {
    const entity = new UserProfileEntity('u_del');
    await store.save(entity);
    expect(await store.exists('u_del')).toBe(true);

    await store.delete('u_del');
    expect(await store.exists('u_del')).toBe(false);
    expect(await store.load('u_del')).toBeNull();
  });
});

describe('ProfileDimensionRegistry', () => {
  it('registers and retrieves plugins', () => {
    const registry = new ProfileDimensionRegistry();
    const plugin: ProfileDimensionPlugin = {
      dimensionId: 'test_dim',
      displayName: 'Test Dimension',
      extractFromOrders: () => ({}),
      updateFromConversation: () => ({}),
      summarize: () => 'test summary',
    };

    registry.register(plugin);
    expect(registry.getPlugin('test_dim')).toBe(plugin);
    expect(registry.listAll()).toHaveLength(1);

    registry.unregister('test_dim');
    expect(registry.getPlugin('test_dim')).toBeUndefined();
  });

  it('filters plugins by category', () => {
    const registry = new ProfileDimensionRegistry();

    const clothingPlugin: ProfileDimensionPlugin = {
      dimensionId: 'clothing_spec', displayName: 'Clothing',
      applicableCategories: ['femaleClothing', 'maleClothing'],
      extractFromOrders: () => ({}), updateFromConversation: () => ({}), summarize: () => '',
    };
    const universalPlugin: ProfileDimensionPlugin = {
      dimensionId: 'spending', displayName: 'Spending',
      extractFromOrders: () => ({}), updateFromConversation: () => ({}), summarize: () => '',
    };

    registry.register(clothingPlugin);
    registry.register(universalPlugin);

    const forClothing = registry.getPluginsForCategory('femaleClothing');
    expect(forClothing).toHaveLength(2);

    const forDigital = registry.getPluginsForCategory('digital');
    expect(forDigital).toHaveLength(1);
    expect(forDigital[0].dimensionId).toBe('spending');
  });
});

describe('ColdStartManager', () => {
  it('returns ask_preference for cold users', () => {
    const mgr = new ColdStartManager();
    const profile = new UserProfileEntity('u_cold');

    const action = mgr.getAction(profile);
    expect(action.type).toBe('ask_preference');
  });

  it('returns normal for hot users', () => {
    const mgr = new ColdStartManager();
    const profile = new UserProfileEntity('u_hot', {
      femaleClothing: {
        weight: [100, 110], height: [160, 170], waistline: [66, 70],
        bust: [80, 90], footLength: [235, 245],
        size: ['M'], bottomSize: ['M'], shoeSize: ['37'],
      },
    });

    const action = mgr.getAction(profile);
    expect(action.type).toBe('normal');
  });

  it('filters badcase for cold users', () => {
    const mgr = new ColdStartManager();
    const cold = new UserProfileEntity('u_cold');
    const hot = new UserProfileEntity('u_hot', {
      femaleClothing: {
        weight: [100, 110], height: [160, 170], waistline: [66, 70],
        bust: [80, 90], footLength: [235, 245],
        size: ['M'], bottomSize: ['M'], shoeSize: ['37'],
      },
    });

    expect(mgr.shouldFilterBadCase(cold)).toBe(true);
    expect(mgr.shouldFilterBadCase(hot)).toBe(false);
  });

  it('isolates asked questions per userId', () => {
    const mgr = new ColdStartManager();
    const profileA = new UserProfileEntity('userA');
    const profileB = new UserProfileEntity('userB');

    const a1 = mgr.getAction(profileA, 'userA');
    const b1 = mgr.getAction(profileB, 'userB');
    expect(a1.type).toBe('ask_preference');
    expect(b1.type).toBe('ask_preference');
    if (a1.type === 'ask_preference' && b1.type === 'ask_preference') {
      expect(a1.question).toBe(b1.question);
    }

    const a2 = mgr.getAction(profileA, 'userA');
    const b2 = mgr.getAction(profileB, 'userB');
    if (a2.type === 'ask_preference' && b2.type === 'ask_preference') {
      expect(a2.question).toBe(b2.question);
    }
  });

  it('reset(userId) only clears that user', () => {
    const mgr = new ColdStartManager();
    const profileA = new UserProfileEntity('userA');
    const profileB = new UserProfileEntity('userB');

    const a1 = mgr.getAction(profileA, 'userA');
    mgr.getAction(profileB, 'userB');

    mgr.reset('userA');
    const a1Again = mgr.getAction(profileA, 'userA');
    if (a1.type === 'ask_preference' && a1Again.type === 'ask_preference') {
      expect(a1Again.question).toBe(a1.question);
    }
  });
});
