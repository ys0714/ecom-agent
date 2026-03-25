import { describe, it, expect } from 'vitest';
import { PreferenceDetector } from '../../src/application/services/profile-engine/preference-detector.js';
import { arbitrate, adjustConfidence } from '../../src/application/services/profile-engine/confidence-arbitrator.js';
import type { PreferenceSignal } from '../../src/application/services/profile-engine/preference-detector.js';

describe('PreferenceDetector', () => {
  const detector = new PreferenceDetector();

  it('detects explicit size override (positive)', () => {
    const signal = detector.detect('我要L码');
    expect(signal.type).toBe('explicit_override');
    expect(signal.confidence).toBe(1.0);
    expect(signal.value.specifiedSize).toBe('L');
  });

  it('detects explicit size override (with "给我")', () => {
    const signal = detector.detect('给我选XL');
    expect(signal.type).toBe('explicit_override');
    expect(signal.value.specifiedSize).toBe('XL');
  });

  it('detects size rejection', () => {
    const signal = detector.detect('不要M码');
    expect(signal.type).toBe('explicit_override');
    expect(signal.value.rejectedSize).toBe('M');
  });

  it('detects role switch to male', () => {
    const signal = detector.detect('帮我老公买一件外套');
    expect(signal.type).toBe('role_switch');
    expect(signal.confidence).toBe(0.4);
    expect(signal.value.targetRole).toBe('male');
  });

  it('detects role switch to child', () => {
    const signal = detector.detect('给孩子选一件');
    expect(signal.type).toBe('role_switch');
    expect(signal.value.targetRole).toBe('child');
  });

  it('detects fit modifier (loose)', () => {
    const signal = detector.detect('我想要宽松的');
    expect(signal.type).toBe('fit_modifier');
    expect(signal.value.fitDirection).toBe('loose');
  });

  it('detects fit modifier (tight)', () => {
    const signal = detector.detect('修身款的');
    expect(signal.type).toBe('fit_modifier');
    expect(signal.value.fitDirection).toBe('tight');
  });

  it('detects profile correction (height)', () => {
    const signal = detector.detect('我身高165cm');
    expect(signal.type).toBe('profile_correction');
    expect(signal.value.height).toBe(165);
  });

  it('detects profile correction (weight)', () => {
    const signal = detector.detect('我体重110斤');
    expect(signal.type).toBe('profile_correction');
    expect(signal.value.weight).toBe(110);
  });

  it('detects profile correction (both)', () => {
    const signal = detector.detect('我身高170cm，体重120斤');
    expect(signal.type).toBe('profile_correction');
    expect(signal.value.height).toBe(170);
    expect(signal.value.weight).toBe(120);
  });

  it('returns none for normal messages', () => {
    const signal = detector.detect('这件衣服好看吗');
    expect(signal.type).toBe('none');
  });
});

describe('ConfidenceArbitrator', () => {
  it('always accepts explicit override', () => {
    const signal: PreferenceSignal = { type: 'explicit_override', confidence: 1.0, value: {}, source: 'conversation' };
    const result = arbitrate(0.9, signal);
    expect(result.decision).toBe('accept');
    expect(result.effectiveConfidence).toBe(1.0);
  });

  it('ignores none signal', () => {
    const signal: PreferenceSignal = { type: 'none', confidence: 0, value: {}, source: 'conversation' };
    const result = arbitrate(0.8, signal);
    expect(result.decision).toBe('ignore');
  });

  it('accepts when incoming significantly stronger', () => {
    const signal: PreferenceSignal = { type: 'profile_correction', confidence: 0.7, value: {}, source: 'conversation' };
    const result = arbitrate(0.3, signal);
    expect(result.decision).toBe('accept');
  });

  it('merges when confidences are close', () => {
    const signal: PreferenceSignal = { type: 'fit_modifier', confidence: 0.6, value: {}, source: 'conversation' };
    const result = arbitrate(0.6, signal);
    expect(result.decision).toBe('merge');
    expect(result.effectiveConfidence).toBe(0.6);
  });

  it('ignores when incoming much weaker', () => {
    const signal: PreferenceSignal = { type: 'role_switch', confidence: 0.4, value: {}, source: 'conversation' };
    const result = arbitrate(0.9, signal);
    expect(result.decision).toBe('ignore');
  });
});

describe('adjustConfidence', () => {
  it('increases on positive feedback', () => {
    expect(adjustConfidence(0.7, 'positive')).toBeCloseTo(0.8);
  });

  it('decreases on negative feedback', () => {
    expect(adjustConfidence(0.7, 'negative')).toBeCloseTo(0.6);
  });

  it('clamps to [0, 1]', () => {
    expect(adjustConfidence(0.95, 'positive')).toBe(1.0);
    expect(adjustConfidence(0.05, 'negative')).toBeCloseTo(0);
  });
});
