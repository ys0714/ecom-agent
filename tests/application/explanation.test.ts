import { describe, it, expect } from 'vitest';
import { generateExplanation, formatExplanationForReply } from '../../src/application/services/profile-engine/explanation-generator.js';
import type { GenderSpecProfile, ProductSpecProfile } from '../../src/domain/types.js';

const profile: GenderSpecProfile = {
  weight: [105, 115], height: [160, 170],
  waistline: null, bust: null, footLength: null,
  size: ['M'], bottomSize: null, shoeSize: ['37', '38'],
};

const productSpec: ProductSpecProfile = {
  propValueId: 'pv_m', productId: 'p101', category: 'femaleClothing',
  targetAudience: 'adult_female',
  weight: [95, 115], height: [155, 168],
  waistline: null, bust: null, footLength: null,
  size: 'M', bottomSize: null, shoeSize: null,
};

describe('ExplanationGenerator', () => {
  it('generates three-layer explanation for high confidence', () => {
    const explanation = generateExplanation({
      profile, productSpec,
      matchResult: {
        propValueId: 'pv_m', totalCoverage: 0.85,
        featureCoverages: { height: 0.8, weight: 1.0 },
        matchedFeatureCount: 2,
      },
      confidence: 0.85,
      orderCount: 12,
      isTemporaryProfile: false,
    });

    expect(explanation.conclusion).toContain('M');
    expect(explanation.reasoning).toContain('购买记录');
    expect(explanation.reasoning).toContain('12笔订单');
    expect(explanation.reasoning).toContain('匹配');
    expect(explanation.caveat).toBe('');
  });

  it('adds caveat for medium confidence', () => {
    const explanation = generateExplanation({
      profile, productSpec,
      matchResult: { propValueId: 'pv_m', totalCoverage: 0.5, featureCoverages: { height: 0.5 }, matchedFeatureCount: 1 },
      confidence: 0.5,
      orderCount: 3,
      isTemporaryProfile: false,
    });

    expect(explanation.caveat).toContain('体型有变化');
  });

  it('adds caveat for low confidence', () => {
    const explanation = generateExplanation({
      profile, productSpec,
      matchResult: { propValueId: 'pv_m', totalCoverage: 0.2, featureCoverages: {}, matchedFeatureCount: 0 },
      confidence: 0.2,
      orderCount: 1,
      isTemporaryProfile: false,
    });

    expect(explanation.caveat).toContain('尺码表');
  });

  it('adds temporary profile caveat for role switch', () => {
    const explanation = generateExplanation({
      profile, productSpec,
      matchResult: { propValueId: 'pv_m', totalCoverage: 0.8, featureCoverages: { height: 0.9 }, matchedFeatureCount: 1 },
      confidence: 0.8,
      orderCount: 0,
      isTemporaryProfile: true,
    });

    expect(explanation.reasoning).toContain('提供的信息');
    expect(explanation.caveat).toContain('首次');
  });

  it('formatExplanationForReply combines all layers', () => {
    const explanation = {
      conclusion: '推荐 M',
      reasoning: '根据您的画像，M 码匹配度最高。',
      caveat: '如果体型有变化，请告诉我。',
    };
    const text = formatExplanationForReply(explanation);
    expect(text).toContain('【推荐 M】');
    expect(text).toContain('根据您的画像');
    expect(text).toContain('体型有变化');
  });

  it('formatExplanationForReply omits caveat when empty', () => {
    const text = formatExplanationForReply({ conclusion: '推荐 L', reasoning: '匹配度高。', caveat: '' });
    expect(text).toBe('【推荐 L】匹配度高。');
  });
});
