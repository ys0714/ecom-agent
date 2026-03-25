import { describe, it, expect } from 'vitest';
import type {
  GenderSpecProfile, UserSpecProfile, ProductSpecProfile,
  ProfileMeta, AgentEvent, Message, SpecRecommendation,
  WorkflowType, ColdStartStage, NumericRange,
} from '../../src/domain/types.js';

describe('domain/types', () => {
  it('GenderSpecProfile accepts valid body measurements', () => {
    const profile: GenderSpecProfile = {
      weight: [105, 115],
      height: [160, 170],
      waistline: null,
      bust: null,
      footLength: [235, 245],
      size: ['M', 'L'],
      bottomSize: ['M'],
      shoeSize: ['37', '38'],
    };
    expect(profile.weight![0]).toBeLessThan(profile.weight![1]);
    expect(profile.size).toContain('M');
  });

  it('UserSpecProfile supports multi-gender roles', () => {
    const user: UserSpecProfile = {
      userId: 'u123',
      femaleClothing: {
        weight: [100, 120], height: [155, 165],
        waistline: null, bust: null, footLength: null,
        size: ['S'], bottomSize: null, shoeSize: null,
      },
      childClothing: {
        weight: [30, 50], height: [110, 130],
        waistline: null, bust: null, footLength: null,
        size: null, bottomSize: null, shoeSize: ['30', '32'],
      },
      defaultRole: 'female',
      updatedAt: new Date().toISOString(),
    };
    expect(user.femaleClothing).toBeDefined();
    expect(user.childClothing).toBeDefined();
    expect(user.maleClothing).toBeUndefined();
  });

  it('ProductSpecProfile represents a single SKU spec variant', () => {
    const spec: ProductSpecProfile = {
      propValueId: '105217133',
      productId: 'p456',
      category: 'femaleClothing',
      targetAudience: 'adult_female',
      weight: [80, 110],
      height: [160, 165],
      waistline: null,
      bust: [80, 110],
      footLength: null,
      size: '2XL',
      bottomSize: null,
      shoeSize: '40',
    };
    expect(spec.propValueId).toBe('105217133');
    expect(spec.size).toBe('2XL');
  });

  it('ProfileMeta tracks cold start stage', () => {
    const meta: ProfileMeta = {
      totalOrders: 0,
      profileCompleteness: 0,
      lastOrderAt: '',
      dataFreshness: 0,
      coldStartStage: 'cold',
    };
    expect(meta.coldStartStage).toBe('cold');

    const stages: ColdStartStage[] = ['cold', 'warm', 'hot'];
    expect(stages).toHaveLength(3);
  });

  it('Message structure supports all roles', () => {
    const msgs: Message[] = [
      { role: 'system', content: 'You are a helpful agent', timestamp: new Date().toISOString() },
      { role: 'user', content: '推荐一件XL的外套', timestamp: new Date().toISOString() },
      { role: 'assistant', content: '为您推荐这款...', timestamp: new Date().toISOString() },
      { role: 'tool', content: '{"result": "found"}', name: 'search_product', toolCallId: 'tc_1', timestamp: new Date().toISOString() },
    ];
    expect(msgs).toHaveLength(4);
    expect(msgs[3].name).toBe('search_product');
  });

  it('SpecRecommendation captures match method', () => {
    const rec: SpecRecommendation = {
      propValueId: 'pv_001',
      selectedSpecs: { size: 'L', color: '黑色' },
      confidence: 0.87,
      matchMethod: 'coverage',
    };
    expect(rec.matchMethod).toBe('coverage');
    expect(rec.confidence).toBeGreaterThan(0.5);
  });

  it('WorkflowType covers all business scenarios', () => {
    const types: WorkflowType[] = [
      'product_consult', 'after_sale', 'logistics', 'complaint', 'general',
    ];
    expect(types).toHaveLength(5);
  });

  it('AgentEvent has correct shape', () => {
    const event: AgentEvent = {
      type: 'profile:updated',
      timestamp: new Date().toISOString(),
      sessionId: 's_001',
      payload: { dimensionId: 'specPreference', userId: 'u123' },
    };
    expect(event.type).toBe('profile:updated');
    expect(event.payload).toHaveProperty('dimensionId');
  });

  it('NumericRange is a two-element tuple', () => {
    const range: NumericRange = [160, 170];
    expect(range).toHaveLength(2);
    expect(range[0]).toBeLessThanOrEqual(range[1]);
  });
});
