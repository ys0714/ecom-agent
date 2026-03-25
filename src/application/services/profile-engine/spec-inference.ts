import type {
  UserSpecProfile, GenderSpecProfile, ProductSpecProfile,
  ProductInfo, SpecRecommendation, NumericRange, TargetAudience, GenderRole,
} from '../../../domain/types.js';
import { UserProfileEntity } from '../../../domain/entities/user-profile.entity.js';

/** Body feature keys that use numeric ranges for coverage matching */
const RANGE_FEATURES = ['weight', 'height', 'waistline', 'bust', 'footLength'] as const;
type RangeFeature = typeof RANGE_FEATURES[number];

/** Default feature priority order — configurable at runtime */
const DEFAULT_FEATURE_PRIORITY: RangeFeature[] = [
  'height', 'weight', 'bust', 'waistline', 'footLength',
];

function audienceToRole(audience: TargetAudience): GenderRole {
  switch (audience) {
    case 'adult_female': return 'female';
    case 'adult_male': return 'male';
    case 'child': return 'child';
  }
}

/**
 * Compute overlap ratio between user range and product range.
 * Returns 0~1 where 1 means product range fully covers user range.
 */
export function computeCoverage(userRange: NumericRange, productRange: NumericRange): number {
  const overlapMin = Math.max(userRange[0], productRange[0]);
  const overlapMax = Math.min(userRange[1], productRange[1]);
  if (overlapMin > overlapMax) return 0;

  const overlapLength = overlapMax - overlapMin;
  const userLength = userRange[1] - userRange[0];
  if (userLength === 0) {
    return (userRange[0] >= productRange[0] && userRange[0] <= productRange[1]) ? 1 : 0;
  }
  return overlapLength / userLength;
}

export interface SpecMatchResult {
  propValueId: string;
  totalCoverage: number;
  featureCoverages: Partial<Record<RangeFeature, number>>;
  matchedFeatureCount: number;
}

/**
 * Score a single product spec variant against user's gender profile.
 * Iterates features in priority order; any overlap > 0 contributes to score.
 */
export function scoreSpec(
  userProfile: GenderSpecProfile,
  productSpec: ProductSpecProfile,
  featurePriority: RangeFeature[] = DEFAULT_FEATURE_PRIORITY,
): SpecMatchResult {
  const coverages: Partial<Record<RangeFeature, number>> = {};
  let totalWeight = 0;
  let weightedSum = 0;
  let matched = 0;

  for (let i = 0; i < featurePriority.length; i++) {
    const feature = featurePriority[i];
    const userRange = userProfile[feature];
    const prodRange = productSpec[feature];
    if (!userRange || !prodRange) continue;

    const coverage = computeCoverage(userRange, prodRange);
    coverages[feature] = coverage;

    const priorityWeight = featurePriority.length - i;
    totalWeight += priorityWeight;
    weightedSum += coverage * priorityWeight;

    if (coverage > 0) matched++;
  }

  return {
    propValueId: productSpec.propValueId,
    totalCoverage: totalWeight > 0 ? weightedSum / totalWeight : 0,
    featureCoverages: coverages,
    matchedFeatureCount: matched,
  };
}

/**
 * SpecInferenceEngine — coverage-based spec matching.
 *
 * Step 1: Try coverage algorithm (zero model calls).
 *         Pick the spec variant with highest weighted coverage.
 * Step 2: If no match, return null (caller should fallback to model inference).
 */
export function matchSpecs(
  profile: UserProfileEntity,
  product: ProductInfo,
  featurePriority?: RangeFeature[],
): SpecRecommendation | null {
  if (product.specs.length === 0) return null;

  const sampleSpec = product.specs[0];
  const role = audienceToRole(sampleSpec.targetAudience);
  const genderProfile = profile.getGenderProfile(role);
  if (!genderProfile) return null;

  const scored = product.specs
    .map((spec) => scoreSpec(genderProfile, spec, featurePriority))
    .filter((r) => r.matchedFeatureCount > 0)
    .sort((a, b) => b.totalCoverage - a.totalCoverage);

  if (scored.length === 0) return null;

  const best = scored[0];
  const bestSpec = product.specs.find((s) => s.propValueId === best.propValueId)!;

  const selectedSpecs: Record<string, string> = {};
  if (bestSpec.size) selectedSpecs['size'] = bestSpec.size;
  if (bestSpec.bottomSize) selectedSpecs['bottomSize'] = bestSpec.bottomSize;
  if (bestSpec.shoeSize) selectedSpecs['shoeSize'] = bestSpec.shoeSize;

  return {
    propValueId: best.propValueId,
    selectedSpecs,
    confidence: Math.round(best.totalCoverage * 100) / 100,
    matchMethod: 'coverage',
    reasoning: formatReasoning(best, genderProfile),
  };
}

function formatReasoning(result: SpecMatchResult, profile: GenderSpecProfile): string {
  const parts: string[] = [];
  for (const [feature, coverage] of Object.entries(result.featureCoverages)) {
    if (coverage === undefined) continue;
    const userRange = profile[feature as RangeFeature];
    if (!userRange) continue;
    const pct = Math.round(coverage * 100);
    const labels: Record<string, string> = {
      height: '身高', weight: '体重', waistline: '腰围',
      bust: '胸围', footLength: '脚长',
    };
    parts.push(`${labels[feature] ?? feature}匹配${pct}%`);
  }
  return parts.join('，');
}
