import type { GenderSpecProfile, ProductSpecProfile, NumericRange } from '../../../domain/types.js';
import type { SpecMatchResult } from './spec-inference.js';

export interface ExplanationContext {
  profile: GenderSpecProfile;
  productSpec: ProductSpecProfile;
  matchResult: SpecMatchResult;
  confidence: number;
  orderCount: number;
  isTemporaryProfile: boolean;
}

export interface Explanation {
  conclusion: string;
  reasoning: string;
  caveat: string;
}

const FEATURE_LABELS: Record<string, string> = {
  height: '身高', weight: '体重', waistline: '腰围',
  bust: '胸围', footLength: '脚长',
};

function formatRange(range: NumericRange, unit: string): string {
  return range[0] === range[1] ? `${range[0]}${unit}` : `${range[0]}-${range[1]}${unit}`;
}

const FEATURE_UNITS: Record<string, string> = {
  height: 'cm', weight: '斤', waistline: 'cm', bust: 'cm', footLength: 'mm',
};

export function generateExplanation(ctx: ExplanationContext): Explanation {
  const { profile, productSpec, matchResult, confidence, orderCount, isTemporaryProfile } = ctx;

  const specLabel = productSpec.size ?? productSpec.bottomSize ?? productSpec.shoeSize ?? '该规格';
  const conclusion = `推荐 ${specLabel}`;

  const profileParts: string[] = [];
  const matchParts: string[] = [];

  for (const [feature, coverage] of Object.entries(matchResult.featureCoverages)) {
    if (coverage === undefined) continue;
    const label = FEATURE_LABELS[feature] ?? feature;
    const unit = FEATURE_UNITS[feature] ?? '';
    const userRange = profile[feature as keyof GenderSpecProfile] as NumericRange | null;
    const prodRange = productSpec[feature as keyof ProductSpecProfile] as NumericRange | null;

    if (userRange) {
      profileParts.push(`${label}${formatRange(userRange, unit)}`);
    }
    if (prodRange) {
      const pct = Math.round(coverage * 100);
      matchParts.push(`${label}匹配${pct}%`);
    }
  }

  let reasoning: string;
  if (profileParts.length > 0) {
    const profileDesc = isTemporaryProfile
      ? `根据您提供的信息（${profileParts.join('，')}）`
      : orderCount > 0
        ? `根据您的购买记录（${profileParts.join('，')}，${orderCount}笔订单）`
        : `根据您的画像信息（${profileParts.join('，')}）`;

    const specDesc = `该商品 ${specLabel} 适合${matchParts.length > 0 ? '（' + matchParts.join('，') + '）' : ''}`;
    reasoning = `${profileDesc}，${specDesc}，与您的体型高度匹配。`;
  } else {
    reasoning = `基于商品规格分析，${specLabel} 是最匹配的选择。`;
  }

  let caveat = '';
  if (isTemporaryProfile) {
    caveat = '由于是首次为他/她选购，建议参考商品详情页确认。';
  } else if (confidence < 0.3) {
    caveat = '您也可以参考商品详情页的尺码表。';
  } else if (confidence < 0.7) {
    caveat = '如果您近期体型有变化，可以告诉我帮您调整。';
  }

  return { conclusion, reasoning, caveat };
}

export function formatExplanationForReply(explanation: Explanation): string {
  let text = `【${explanation.conclusion}】${explanation.reasoning}`;
  if (explanation.caveat) {
    text += `\n${explanation.caveat}`;
  }
  return text;
}
