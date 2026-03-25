import type { GenderRole } from '../../../domain/types.js';

export type OverrideType = 'explicit_override' | 'role_switch' | 'fit_modifier' | 'profile_correction' | 'none';

export interface PreferenceSignal {
  type: OverrideType;
  confidence: number;
  value: Record<string, unknown>;
  source: 'conversation';
}

const SIZE_PATTERN = /(?:我要|给我|换成?|选)\s*([A-Z0-9]{1,4})\s*码?/i;
const REJECT_PATTERN = /不要\s*([A-Z0-9]{1,4})\s*码?|别.{0,4}([A-Z0-9]{1,4})\s*码/i;
const ROLE_PATTERNS: Array<{ pattern: RegExp; role: GenderRole }> = [
  { pattern: /(?:帮|给)\s*(?:我\s*)?(?:老公|先生|男朋友|老爸|爸爸|父亲)/, role: 'male' },
  { pattern: /(?:帮|给)\s*(?:我\s*)?(?:老婆|女朋友|老妈|妈妈|母亲|女友)/, role: 'female' },
  { pattern: /(?:帮|给)\s*(?:我\s*)?(?:孩子|小孩|儿子|女儿|宝宝|娃)/, role: 'child' },
];
const FIT_PATTERNS: Array<{ pattern: RegExp; direction: 'loose' | 'tight' }> = [
  { pattern: /(?:宽松|偏大|大一[码号]|肥一点)/, direction: 'loose' },
  { pattern: /(?:修身|偏小|小一[码号]|紧身|贴身|瘦一点)/, direction: 'tight' },
];
const HEIGHT_PATTERN = /(?:身高|我)\s*(\d{2,3})\s*(?:cm|厘米)/;
const WEIGHT_PATTERN = /(?:体重|我)\s*(\d{2,3})\s*(?:斤|kg|公斤)/;

export class PreferenceDetector {
  detect(message: string): PreferenceSignal {
    const sizeMatch = SIZE_PATTERN.exec(message);
    if (sizeMatch) {
      return {
        type: 'explicit_override',
        confidence: 1.0,
        value: { specifiedSize: sizeMatch[1].toUpperCase() },
        source: 'conversation',
      };
    }

    const rejectMatch = REJECT_PATTERN.exec(message);
    if (rejectMatch) {
      const rejected = (rejectMatch[1] ?? rejectMatch[2]).toUpperCase();
      return {
        type: 'explicit_override',
        confidence: 1.0,
        value: { rejectedSize: rejected },
        source: 'conversation',
      };
    }

    for (const { pattern, role } of ROLE_PATTERNS) {
      if (pattern.test(message)) {
        return {
          type: 'role_switch',
          confidence: 0.4,
          value: { targetRole: role },
          source: 'conversation',
        };
      }
    }

    for (const { pattern, direction } of FIT_PATTERNS) {
      if (pattern.test(message)) {
        return {
          type: 'fit_modifier',
          confidence: 0.6,
          value: { fitDirection: direction },
          source: 'conversation',
        };
      }
    }

    const corrections: Record<string, unknown> = {};
    const heightMatch = HEIGHT_PATTERN.exec(message);
    if (heightMatch) corrections.height = parseFloat(heightMatch[1]);
    const weightMatch = WEIGHT_PATTERN.exec(message);
    if (weightMatch) corrections.weight = parseFloat(weightMatch[1]);

    if (Object.keys(corrections).length > 0) {
      return {
        type: 'profile_correction',
        confidence: 0.7,
        value: corrections,
        source: 'conversation',
      };
    }

    return { type: 'none', confidence: 0, value: {}, source: 'conversation' };
  }
}
