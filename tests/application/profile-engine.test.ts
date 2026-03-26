import { describe, it, expect, beforeEach } from 'vitest';
import { buildProfileFromOrders } from '../../src/application/services/profile-engine/order-analyzer.js';
import { ProfileDimensionRegistry } from '../../src/application/services/profile-engine/dimension-registry.js';
import { ColdStartManager } from '../../src/application/services/profile-engine/cold-start-manager.js';
import { ProfileStore } from '../../src/application/services/profile-store.js';
import { InMemoryRedisClient } from '../../src/infra/adapters/redis.js';
import { UserProfileEntity } from '../../src/domain/entities/user-profile.entity.js';
import { MockOrderService } from '../../src/infra/adapters/order-service.js';
import type { Order, ProfileDimensionPlugin, DimensionData, DimensionDelta, Message } from '../../src/domain/types.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('OrderAnalyzer + ProfileBuilder', () => {
  it('builds profile from order history', async () => {
    const orders: Order[] = [
      {
        orderId: 'o1', userId: 'u1',
        items: [{
          productId: 'p1', productName: '打底衫S',
          category: 'femaleClothing', specDescription: '尺码：S，体重区间105-115斤',
          price: 99, quantity: 1,
        }],
        totalAmount: 99, createdAt: '2025-11-01T00:00:00Z', status: 'delivered',
      },
      {
        orderId: 'o2', userId: 'u1',
        items: [{
          productId: 'p2', productName: '牛仔裤M',
          category: 'femaleClothing', specDescription: '尺码：M，身高区间160-170cm，体重区间100-120斤',
          price: 159, quantity: 1,
        }],
        totalAmount: 159, createdAt: '2025-12-01T00:00:00Z', status: 'delivered',
      },
    ];

    const profile = await buildProfileFromOrders('u1', orders);
    expect(profile.userId).toBe('u1');

    const female = profile.getGenderProfile('female')!;
    expect(female).toBeDefined();
    expect(female.weight).toEqual([100, 120]);
    expect(female.height).toEqual([160, 170]);
    expect(female.size).toEqual(expect.arrayContaining(['S', 'M']));
    expect(profile.meta.totalOrders).toBe(2);
  });

  it('handles empty order list gracefully', async () => {
    const profile = await buildProfileFromOrders('u_empty', []);
    expect(profile.getColdStartStage()).toBe('cold');
    expect(profile.getCompleteness()).toBe(0);
  });

  it('parses shoe size from order spec', async () => {
    const orders: Order[] = [{
      orderId: 'o3', userId: 'u2',
      items: [{
        productId: 'p3', productName: '运动鞋',
        category: 'femaleClothing', specDescription: '鞋码：38，脚长区间240-245mm',
        price: 299, quantity: 1,
      }],
      totalAmount: 299, createdAt: '2025-12-15T00:00:00Z', status: 'delivered',
    }];

    const profile = await buildProfileFromOrders('u2', orders);
    const female = profile.getGenderProfile('female')!;
    expect(female.shoeSize).toEqual(['38']);
    expect(female.footLength).toEqual([240, 245]);
  });
});

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
});

describe('Integration: MockOrderService → buildProfile → matchSpecs', () => {
  it('end-to-end: orders → profile → spec recommendation', async () => {
    const orderService = new MockOrderService();
    const orders = await orderService.getOrdersByUserId('u001');

    const profile = await buildProfileFromOrders('u001', orders);
    expect(profile.getColdStartStage()).not.toBe('cold');

    const { matchSpecs } = await import('../../src/application/services/profile-engine/spec-inference.js');
    const { MockProductService } = await import('../../src/infra/adapters/product-service.js');

    const productService = new MockProductService();
    const product = await productService.getProductById('p101');
    expect(product).not.toBeNull();

    const result = matchSpecs(profile, product!);
    expect(result).not.toBeNull();
    const recommendation = result!.recommendation;
    expect(recommendation.matchMethod).toBe('coverage');
    expect(recommendation.selectedSpecs).toHaveProperty('size');
  });
});
