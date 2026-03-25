import { describe, it, expect, vi } from 'vitest';
import { PreferenceDetector, detectByRules, detectAllByRules } from '../../src/application/services/profile-engine/preference-detector.js';
import { ModelPreferenceAnalyzer } from '../../src/application/services/profile-engine/model-preference-analyzer.js';
import type { LLMClient } from '../../src/infra/adapters/llm.js';

describe('detectByRules (fast path)', () => {
  it('returns signal for explicit override', () => {
    expect(detectByRules('我要L码')?.type).toBe('explicit_override');
  });

  it('returns null for implicit preference without explicit keywords', () => {
    expect(detectByRules('这件太小了')).toBeNull();
    expect(detectByRules('上次那件偏紧')).toBeNull();
    expect(detectByRules('感觉不太合身')).toBeNull();
  });

  it('returns null for normal chat', () => {
    expect(detectByRules('这件衣服好看吗')).toBeNull();
  });
});

describe('detectAllByRules (multi-signal)', () => {
  it('returns both role_switch AND profile_correction from one message', () => {
    const signals = detectAllByRules('帮我老公买，他身高180cm，体重150斤');
    const types = signals.map((s) => s.type);
    expect(types).toContain('role_switch');
    expect(types).toContain('profile_correction');

    const roleSignal = signals.find((s) => s.type === 'role_switch')!;
    expect(roleSignal.value.targetRole).toBe('male');

    const correctionSignal = signals.find((s) => s.type === 'profile_correction')!;
    expect(correctionSignal.value.height).toBe(180);
    expect(correctionSignal.value.weight).toBe(150);
  });

  it('returns single signal for simple override', () => {
    const signals = detectAllByRules('我要L码');
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('explicit_override');
  });

  it('returns empty array for no match', () => {
    expect(detectAllByRules('好看吗')).toHaveLength(0);
  });

  it('rules WILL match "朋友身高165cm" (known limitation — LLM path corrects this)', () => {
    const result = detectByRules('我朋友身高165cm帮看看');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('profile_correction');
  });

  it('returns null for normal messages', () => {
    expect(detectByRules('这件衣服好看吗')).toBeNull();
  });
});

describe('ModelPreferenceAnalyzer (LLM deep path)', () => {
  function mockLLMResponse(json: object): LLMClient {
    return { chat: vi.fn().mockResolvedValue(JSON.stringify(json)) };
  }

  it('analyzes implicit fit preference', async () => {
    const llm = mockLLMResponse({
      type: 'fit_modifier', confidence: 0.8,
      value: { fitDirection: 'loose', offset: 1 },
      scope: 'this_turn', subject: 'self',
      reasoning: '用户表示当前尺码偏小，暗示需要大一号',
    });

    const analyzer = new ModelPreferenceAnalyzer(llm);
    const signal = await analyzer.analyze('这件太小了');

    expect(signal.type).toBe('fit_modifier');
    expect(signal.confidence).toBe(0.8);
    expect(signal.scope).toBe('this_turn');
    expect(signal.subject).toBe('self');
  });

  it('distinguishes subject (self vs other)', async () => {
    const llm = mockLLMResponse({
      type: 'profile_correction', confidence: 0.6,
      value: { height: 165 },
      scope: 'this_turn', subject: 'other',
      reasoning: '用户提供的是朋友的身高，不是自己',
    });

    const analyzer = new ModelPreferenceAnalyzer(llm);
    const signal = await analyzer.analyze('我朋友身高165cm帮看看');

    expect(signal.subject).toBe('other');
    expect(signal.type).toBe('profile_correction');
  });

  it('distinguishes scope (this_turn vs permanent)', async () => {
    const llm = mockLLMResponse({
      type: 'explicit_override', confidence: 0.7,
      value: { specifiedSize: 'L' },
      scope: 'this_turn', subject: 'self',
      reasoning: '用户仅针对本件商品想试 L 码',
    });

    const analyzer = new ModelPreferenceAnalyzer(llm);
    const signal = await analyzer.analyze('这件想试试L码');
    expect(signal.scope).toBe('this_turn');
  });

  it('falls back gracefully on LLM error', async () => {
    const llm: LLMClient = { chat: vi.fn().mockRejectedValue(new Error('timeout')) };
    const analyzer = new ModelPreferenceAnalyzer(llm);
    const signal = await analyzer.analyze('something');
    expect(signal.type).toBe('none');
    expect(signal.reasoning).toContain('失败');
  });

  it('handles malformed LLM response', async () => {
    const llm: LLMClient = { chat: vi.fn().mockResolvedValue('not json at all') };
    const analyzer = new ModelPreferenceAnalyzer(llm);
    const signal = await analyzer.analyze('test');
    expect(signal.type).toBe('none');
  });

  it('validates and clamps confidence to [0,1]', async () => {
    const llm = mockLLMResponse({ type: 'fit_modifier', confidence: 1.5, value: {}, scope: 'this_turn', subject: 'self', reasoning: '' });
    const analyzer = new ModelPreferenceAnalyzer(llm);
    const signal = await analyzer.analyze('test');
    expect(signal.confidence).toBe(1.0);
  });
});

describe('PreferenceDetector hybrid routing', () => {
  it('uses rules when they match (no LLM call)', async () => {
    const llm: LLMClient = { chat: vi.fn() };
    const detector = new PreferenceDetector(llm);

    const signal = await detector.detectHybrid('我要XL码');
    expect(signal.type).toBe('explicit_override');
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('falls through to LLM when rules do not match', async () => {
    const llm: LLMClient = {
      chat: vi.fn().mockResolvedValue(JSON.stringify({
        type: 'fit_modifier', confidence: 0.75,
        value: { fitDirection: 'loose' },
        scope: 'this_turn', subject: 'self',
        reasoning: '隐式偏好',
      })),
    };
    const detector = new PreferenceDetector(llm);

    const signal = await detector.detectHybrid('这件太小了');
    expect(signal.type).toBe('fit_modifier');
    expect(llm.chat).toHaveBeenCalledOnce();
  });

  it('returns none when no LLM client and rules do not match', async () => {
    const detector = new PreferenceDetector();
    const signal = await detector.detectHybrid('这件太小了');
    expect(signal.type).toBe('none');
  });

  it('sync detect() still works (backward compatible)', () => {
    const detector = new PreferenceDetector();
    expect(detector.detect('我要M码').type).toBe('explicit_override');
    expect(detector.detect('随便看看').type).toBe('none');
  });
});
