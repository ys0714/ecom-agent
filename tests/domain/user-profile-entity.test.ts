import { describe, it, expect } from 'vitest';
import { UserProfileEntity } from '../../src/domain/entities/user-profile.entity.js';

describe('UserProfileEntity', () => {
  it('creates empty profile in cold start stage', () => {
    const entity = new UserProfileEntity('u001');
    expect(entity.userId).toBe('u001');
    expect(entity.getColdStartStage()).toBe('cold');
    expect(entity.getCompleteness()).toBe(0);
    expect(entity.summarizeForPrompt()).toBe('暂无画像数据');
  });

  it('applyDelta merges spec preference ranges', () => {
    const entity = new UserProfileEntity('u002');

    entity.applyDelta({
      dimensionId: 'specPreference',
      delta: { role: 'female', weight: [100, 110] as [number, number], height: [160, 165] as [number, number], size: ['M'] },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });

    const female = entity.getGenderProfile('female')!;
    expect(female.weight).toEqual([100, 110]);
    expect(female.height).toEqual([160, 165]);
    expect(female.size).toEqual(['M']);
  });

  it('merges ranges by expanding min/max', () => {
    const entity = new UserProfileEntity('u003', {
      femaleClothing: {
        weight: [100, 110], height: [155, 165],
        waistline: null, bust: null, footLength: null,
        size: ['S'], bottomSize: null, shoeSize: null,
      },
    });

    entity.applyDelta({
      dimensionId: 'specPreference',
      delta: { role: 'female', weight: [105, 120] as [number, number], size: ['M', 'L'] },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });

    const female = entity.getGenderProfile('female')!;
    expect(female.weight).toEqual([100, 120]);
    expect(female.size).toEqual(expect.arrayContaining(['S', 'M', 'L']));
  });

  it('summarizeForPrompt generates readable text', () => {
    const entity = new UserProfileEntity('u004', {
      femaleClothing: {
        weight: [105, 115], height: [160, 170],
        waistline: null, bust: null, footLength: null,
        size: ['M'], bottomSize: ['M'], shoeSize: ['37', '38'],
      },
    });

    const summary = entity.summarizeForPrompt();
    expect(summary).toContain('女装');
    expect(summary).toContain('体重105-115斤');
    expect(summary).toContain('身高160-170cm');
    expect(summary).toContain('鞋码37/38');
  });

  it('cold start stage transitions based on completeness', () => {
    const entity = new UserProfileEntity('u005');
    expect(entity.getColdStartStage()).toBe('cold');

    entity.applyDelta({
      dimensionId: 'specPreference',
      delta: { role: 'female', weight: [100, 110] as [number, number], height: [155, 165] as [number, number], size: ['M'] },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });
    expect(entity.getColdStartStage()).toBe('warm');

    entity.applyDelta({
      dimensionId: 'specPreference',
      delta: {
        role: 'female',
        waistline: [66, 70] as [number, number],
        bust: [80, 90] as [number, number],
        footLength: [235, 245] as [number, number],
        bottomSize: ['M'],
        shoeSize: ['37'],
      },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });
    expect(entity.getColdStartStage()).toBe('hot');
    expect(entity.getCompleteness()).toBe(1);
  });

  it('supports multi-gender profiles', () => {
    const entity = new UserProfileEntity('u006');

    entity.applyDelta({
      dimensionId: 'specPreference',
      delta: { role: 'female', weight: [100, 110] as [number, number] },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });
    entity.applyDelta({
      dimensionId: 'specPreference',
      delta: { role: 'child', height: [110, 130] as [number, number], shoeSize: ['30'] },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });

    expect(entity.getGenderProfile('female')?.weight).toEqual([100, 110]);
    expect(entity.getGenderProfile('child')?.height).toEqual([110, 130]);
    expect(entity.getGenderProfile('male')).toBeUndefined();
  });

  it('toJSON / fromJSON roundtrip', () => {
    const entity = new UserProfileEntity('u007', {
      femaleClothing: {
        weight: [105, 115], height: [160, 170],
        waistline: null, bust: null, footLength: null,
        size: ['M'], bottomSize: null, shoeSize: ['37'],
      },
    });
    entity.setMeta({ totalOrders: 5, lastOrderAt: '2025-01-15T00:00:00Z' });

    const json = entity.toJSON();
    const restored = UserProfileEntity.fromJSON(json);

    expect(restored.userId).toBe('u007');
    expect(restored.getGenderProfile('female')?.weight).toEqual([105, 115]);
    expect(restored.meta.totalOrders).toBe(5);
    expect(restored.getCompleteness()).toBe(entity.getCompleteness());
  });

  it('defaults to female role when unspecified', () => {
    const entity = new UserProfileEntity('u008');

    entity.applyDelta({
      dimensionId: 'specPreference',
      delta: { weight: [100, 110] as [number, number] },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });

    expect(entity.getGenderProfile('female')?.weight).toEqual([100, 110]);
  });

  it('stores generic dimensions via applyDelta', () => {
    const entity = new UserProfileEntity('u009');

    entity.applyDelta({
      dimensionId: 'spending',
      delta: { avgOrderAmount: 150, priceRange: 'mid' },
      source: 'order_history',
      timestamp: new Date().toISOString(),
    });

    const spending = entity.getDimension('spending');
    expect(spending).toEqual({ avgOrderAmount: 150, priceRange: 'mid' });
  });
});
