import { describe, it, expect } from 'vitest';
import { computeCoverage, scoreSpec, matchSpecs } from '../../src/application/services/profile-engine/spec-inference.js';
import { UserProfileEntity } from '../../src/domain/entities/user-profile.entity.js';
import type { GenderSpecProfile, ProductSpecProfile, ProductInfo } from '../../src/domain/types.js';

describe('computeCoverage', () => {
  it('returns 1 for identical ranges', () => {
    expect(computeCoverage([160, 170], [160, 170])).toBe(1);
  });

  it('returns 0 for non-overlapping ranges', () => {
    expect(computeCoverage([160, 170], [180, 190])).toBe(0);
  });

  it('returns partial overlap ratio', () => {
    const coverage = computeCoverage([160, 170], [165, 175]);
    expect(coverage).toBeCloseTo(0.5);
  });

  it('handles full containment (product covers user)', () => {
    expect(computeCoverage([163, 167], [160, 175])).toBe(1);
  });

  it('handles point range (user min === max)', () => {
    expect(computeCoverage([165, 165], [160, 170])).toBe(1);
    expect(computeCoverage([165, 165], [170, 180])).toBe(0);
  });
});

describe('scoreSpec', () => {
  const userProfile: GenderSpecProfile = {
    weight: [105, 115], height: [160, 170],
    waistline: null, bust: null, footLength: null,
    size: ['M'], bottomSize: null, shoeSize: ['37', '38'],
  };

  const productSpec: ProductSpecProfile = {
    propValueId: 'pv_L',
    productId: 'p001',
    category: 'femaleClothing',
    targetAudience: 'adult_female',
    weight: [100, 120], height: [160, 170],
    waistline: null, bust: null, footLength: null,
    size: 'L', bottomSize: null, shoeSize: null,
  };

  it('scores matching spec with positive coverage', () => {
    const result = scoreSpec(userProfile, productSpec);
    expect(result.totalCoverage).toBeGreaterThan(0);
    expect(result.matchedFeatureCount).toBe(2);
    expect(result.featureCoverages.height).toBe(1);
    expect(result.featureCoverages.weight).toBe(1);
  });

  it('scores non-matching spec with zero', () => {
    const noMatch: ProductSpecProfile = {
      ...productSpec,
      propValueId: 'pv_3XL',
      weight: [150, 200], height: [180, 195],
    };
    const result = scoreSpec(userProfile, noMatch);
    expect(result.totalCoverage).toBe(0);
    expect(result.matchedFeatureCount).toBe(0);
  });
});

describe('matchSpecs', () => {
  function buildProduct(specs: Partial<ProductSpecProfile>[]): ProductInfo {
    return {
      productId: 'p001',
      productName: '连帽羽绒服',
      category: 'femaleClothing',
      price: 299,
      specs: specs.map((s, i) => ({
        propValueId: `pv_${i}`,
        productId: 'p001',
        category: 'femaleClothing',
        targetAudience: 'adult_female' as const,
        weight: null, height: null, waistline: null, bust: null,
        footLength: null, size: null, bottomSize: null, shoeSize: null,
        ...s,
      })),
    };
  }

  it('picks the spec with highest coverage', () => {
    const profile = new UserProfileEntity('u001', {
      femaleClothing: {
        weight: [105, 115], height: [160, 170],
        waistline: null, bust: null, footLength: null,
        size: ['M'], bottomSize: null, shoeSize: null,
      },
    });

    const product = buildProduct([
      { propValueId: 'pv_S', weight: [80, 100], height: [150, 160], size: 'S' },
      { propValueId: 'pv_M', weight: [95, 115], height: [155, 168], size: 'M' },
      { propValueId: 'pv_L', weight: [100, 125], height: [160, 175], size: 'L' },
    ]);

    const result = matchSpecs(profile, product);
    expect(result).not.toBeNull();
    const recommendation = result!.recommendation;
    expect(recommendation.matchMethod).toBe('coverage');
    expect(recommendation.confidence).toBeGreaterThan(0);
    expect(recommendation.selectedSpecs).toHaveProperty('size');
    expect(recommendation.reasoning).toContain('匹配');
  });

  it('returns null when no spec overlaps with user profile', () => {
    const profile = new UserProfileEntity('u002', {
      femaleClothing: {
        weight: [45, 50], height: [150, 155],
        waistline: null, bust: null, footLength: null,
        size: null, bottomSize: null, shoeSize: null,
      },
    });

    const product = buildProduct([
      { propValueId: 'pv_3XL', weight: [130, 170], height: [180, 195], size: '3XL' },
    ]);

    expect(matchSpecs(profile, product)).toBeNull();
  });

  it('returns null when user has no matching gender profile', () => {
    const profile = new UserProfileEntity('u003', {
      maleClothing: {
        weight: [130, 150], height: [175, 185],
        waistline: null, bust: null, footLength: null,
        size: ['XL'], bottomSize: null, shoeSize: null,
      },
    });

    const product = buildProduct([
      { propValueId: 'pv_M', weight: [95, 115], height: [155, 168], size: 'M' },
    ]);

    expect(matchSpecs(profile, product)).toBeNull();
  });

  it('returns null for empty product specs', () => {
    const profile = new UserProfileEntity('u004');
    const product: ProductInfo = {
      productId: 'p002', productName: 'test', category: 'femaleClothing',
      price: 99, specs: [],
    };
    expect(matchSpecs(profile, product)).toBeNull();
  });

  it('selects best among multiple partially matching specs', () => {
    const profile = new UserProfileEntity('u005', {
      femaleClothing: {
        weight: [100, 110], height: [160, 170],
        waistline: [66, 72], bust: [82, 88], footLength: null,
        size: null, bottomSize: null, shoeSize: null,
      },
    });

    const product = buildProduct([
      { propValueId: 'pv_A', weight: [90, 105], height: [155, 165], waistline: [60, 68], bust: [78, 85], size: 'M' },
      { propValueId: 'pv_B', weight: [100, 115], height: [160, 172], waistline: [66, 74], bust: [82, 90], size: 'L' },
    ]);

    const result = matchSpecs(profile, product)!;
    expect(result.recommendation.propValueId).toBe('pv_B');
    expect(result.recommendation.confidence).toBeGreaterThan(0.5);
  });
});
