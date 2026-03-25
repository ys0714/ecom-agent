import { describe, it, expect } from 'vitest';
import { BadCaseCollector, diagnoseFailureModes } from '../../src/application/services/data-flywheel/badcase-collector.js';
import { BadCaseAnalyzer } from '../../src/application/services/data-flywheel/badcase-analyzer.js';
import { SpecRecommendationEvaluator } from '../../src/application/services/data-flywheel/evaluator.js';
import { TuningAdvisor } from '../../src/application/services/data-flywheel/tuning-advisor.js';
import { ABExperiment } from '../../src/application/services/data-flywheel/ab-experiment.js';
import type { BadCaseTrace } from '../../src/domain/types.js';

function makeTrace(overrides: Partial<BadCaseTrace> = {}): BadCaseTrace {
  return {
    promptVersion: 'v1',
    profileSnapshot: { userId: 'u1', defaultRole: 'female', updatedAt: new Date().toISOString() },
    profileCompleteness: 0.7,
    coldStartStage: 'hot',
    specMatchResult: {
      attempted: true,
      topCandidates: [{ propValueId: 'pv1', coverage: 0.8, featureBreakdown: { height: 0.9, weight: 0.7 } }],
      selectedSpec: 'L',
      fallbackToModel: false,
    },
    intentResult: { intent: 'product_consult', confidence: 0.9, entities: {} },
    workflow: 'product_consult',
    ...overrides,
  };
}

describe('diagnoseFailureModes', () => {
  it('detects cold_start_insufficient', () => {
    const trace = makeTrace({ profileCompleteness: 0.1, coldStartStage: 'cold' });
    const modes = diagnoseFailureModes(trace, 'user_rejection');
    expect(modes).toContain('cold_start_insufficient');
  });

  it('detects low_coverage_match', () => {
    const trace = makeTrace({
      specMatchResult: {
        attempted: true,
        topCandidates: [{ propValueId: 'pv1', coverage: 0.3, featureBreakdown: {} }],
        selectedSpec: 'M', fallbackToModel: false,
      },
    });
    const modes = diagnoseFailureModes(trace, 'spec_override');
    expect(modes).toContain('low_coverage_match');
  });

  it('detects coverage_no_match', () => {
    const trace = makeTrace({
      specMatchResult: { attempted: true, topCandidates: [], selectedSpec: null, fallbackToModel: true },
    });
    const modes = diagnoseFailureModes(trace, 'user_rejection');
    expect(modes).toContain('coverage_no_match');
  });

  it('detects model_fallback_quality', () => {
    const trace = makeTrace({
      specMatchResult: { attempted: true, topCandidates: [], selectedSpec: null, fallbackToModel: true },
    });
    const modes = diagnoseFailureModes(trace, 'user_rejection');
    expect(modes).toContain('model_fallback_quality');
  });

  it('detects presentation_issue', () => {
    const trace = makeTrace({ profileCompleteness: 0.8 });
    const modes = diagnoseFailureModes(trace, 'user_rejection');
    expect(modes).toContain('presentation_issue');
  });

  it('detects profile_stale', () => {
    const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const trace = makeTrace({
      profileSnapshot: { userId: 'u1', defaultRole: 'female', updatedAt: staleDate },
    });
    const modes = diagnoseFailureModes(trace, 'user_rejection');
    expect(modes).toContain('profile_stale');
  });

  it('returns unknown when no patterns match', () => {
    const trace = makeTrace({
      profileCompleteness: 0.8,
      specMatchResult: {
        attempted: true,
        topCandidates: [{ propValueId: 'pv1', coverage: 0.9, featureBreakdown: {} }],
        selectedSpec: 'L', fallbackToModel: false,
      },
    });
    const modes = diagnoseFailureModes(trace, 'session_timeout');
    expect(modes).toEqual(['unknown']);
  });
});

describe('BadCaseCollector with trace', () => {
  it('collects badcases with trace and auto-diagnosed failure modes', () => {
    const collector = new BadCaseCollector(5);
    const trace = makeTrace({ profileCompleteness: 0.1, coldStartStage: 'cold' });

    const bc = collector.collect('user_rejection', 's1', 'u1', 'bad', 'response', trace);
    expect(bc.trace).toBeDefined();
    expect(bc.trace.profileCompleteness).toBe(0.1);
    expect(bc.failureModes).toContain('cold_start_insufficient');
  });
});

describe('BadCaseAnalyzer (multi-dimensional)', () => {
  it('clusters by failure modes with multi-attribution', () => {
    const collector = new BadCaseCollector();
    const coldTrace = makeTrace({ profileCompleteness: 0.1, coldStartStage: 'cold' });
    collector.collect('user_rejection', 's1', 'u1', 'a', 'b', coldTrace);
    collector.collect('user_rejection', 's2', 'u2', 'a', 'b', coldTrace);

    const lowCoverageTrace = makeTrace({
      specMatchResult: {
        attempted: true,
        topCandidates: [{ propValueId: 'pv1', coverage: 0.3, featureBreakdown: {} }],
        selectedSpec: 'M', fallbackToModel: false,
      },
      profileCompleteness: 0.8,
    });
    collector.collect('spec_override', 's3', 'u3', 'a', 'b', lowCoverageTrace);

    const analyzer = new BadCaseAnalyzer();
    const clusters = analyzer.analyze(collector.drainPool());

    expect(clusters.length).toBeGreaterThan(0);
    const coldCluster = clusters.find((c) => c.mode === 'cold_start_insufficient');
    expect(coldCluster).toBeDefined();
    expect(coldCluster!.count).toBe(2);
    expect(coldCluster!.suggestedKnob).toBe('COMPLETENESS_THRESHOLDS');
  });
});

describe('SpecRecommendationEvaluator', () => {
  it('computes evaluation metrics', () => {
    const evaluator = new SpecRecommendationEvaluator();
    const rec = { propValueId: 'pv1', selectedSpecs: { size: 'L' }, confidence: 0.8, matchMethod: 'coverage' as const };

    evaluator.recordOutcome(rec, 'spec_accepted');
    evaluator.recordOutcome(rec, 'spec_accepted');
    evaluator.recordOutcome(rec, 'spec_not_changed');
    evaluator.recordOutcome({ ...rec, matchMethod: 'model_inference' }, 'spec_rejected');

    const metrics = evaluator.evaluate();
    expect(metrics.totalRecommendations).toBe(4);
    expect(metrics.accuracyRate).toBe(0.5);
    expect(metrics.coverageHitRate).toBe(0.75);
    expect(metrics.fallbackRate).toBe(0.25);
  });

  it('detects regression from baseline', () => {
    const evaluator = new SpecRecommendationEvaluator();
    const rec = { propValueId: 'pv1', selectedSpecs: {}, confidence: 0.5, matchMethod: 'coverage' as const };

    for (let i = 0; i < 10; i++) {
      evaluator.recordOutcome(rec, i < 5 ? 'spec_accepted' : 'spec_rejected');
    }

    const baseline = { ...evaluator.evaluate(), accuracyRate: 0.7 };
    const regressions = evaluator.hasRegressionFrom(baseline);
    expect(regressions.length).toBeGreaterThan(0);
    expect(regressions[0]).toContain('accuracyRate');
  });
});

describe('TuningAdvisor', () => {
  it('recommends knob adjustments based on top failure mode', () => {
    const advisor = new TuningAdvisor({
      COMPLETENESS_THRESHOLDS: { getValue: () => 0.3 },
      MIN_RECOMMEND_CONFIDENCE: { getValue: () => 0.5 },
    });

    const cluster = {
      mode: 'cold_start_insufficient' as const,
      cases: [],
      count: 15,
      percentage: 35,
      suggestedKnob: 'COMPLETENESS_THRESHOLDS',
    };

    const rec = advisor.recommend(cluster);
    expect(rec).not.toBeNull();
    expect(rec!.knob).toBe('COMPLETENESS_THRESHOLDS.warm');
    expect(rec!.confidence).toBe('high');
  });

  it('recommends confidence increase for presentation issues', () => {
    const advisor = new TuningAdvisor({
      MIN_RECOMMEND_CONFIDENCE: { getValue: () => 0.5 },
    });

    const cluster = {
      mode: 'presentation_issue' as const,
      cases: [],
      count: 8,
      percentage: 20,
      suggestedKnob: 'MIN_RECOMMEND_CONFIDENCE',
    };

    const rec = advisor.recommend(cluster);
    expect(rec!.suggestedValue).toBe(0.6);
  });
});

describe('ABExperiment with success signals', () => {
  it('records typed outcomes', () => {
    const ab = new ABExperiment();
    ab.create({
      id: 'exp1', controlPromptId: 'v1', treatmentPromptId: 'v2',
      trafficRatio: 0.1, minSampleSize: 10,
      startedAt: new Date().toISOString(), status: 'running',
    });

    ab.recordOutcome('exp1', { isControl: true, signal: 'spec_accepted' });
    ab.recordOutcome('exp1', { isControl: true, signal: 'spec_rejected' });
    ab.recordOutcome('exp1', { isControl: false, signal: 'spec_accepted' });
    ab.recordOutcome('exp1', { isControl: false, signal: 'session_purchase' });

    const m = ab.getMetrics('exp1')!;
    expect(m.controlSamples).toBe(2);
    expect(m.treatmentSamples).toBe(2);
    expect(m.controlAcceptCount).toBe(1);
    expect(m.treatmentAcceptCount).toBe(1);
    expect(m.treatmentPurchaseCount).toBe(1);
  });

  it('returns continue when insufficient samples', () => {
    const ab = new ABExperiment();
    ab.create({
      id: 'exp2', controlPromptId: 'v1', treatmentPromptId: 'v2',
      trafficRatio: 0.5, minSampleSize: 1000,
      startedAt: new Date().toISOString(), status: 'running',
    });
    ab.recordOutcome('exp2', { isControl: true, signal: 'spec_accepted' });
    expect(ab.evaluate('exp2')).toBe('continue');
  });
});

describe('Flywheel integration: Trace → Evaluate → Analyze → Advise', () => {
  it('end-to-end flywheel cycle', () => {
    const collector = new BadCaseCollector(3);
    const evaluator = new SpecRecommendationEvaluator();

    const lowCoverageTrace = makeTrace({
      specMatchResult: {
        attempted: true,
        topCandidates: [{ propValueId: 'pv1', coverage: 0.3, featureBreakdown: { height: 0.4, weight: 0.2 } }],
        selectedSpec: 'M', fallbackToModel: false,
      },
      profileCompleteness: 0.8,
    });

    for (let i = 0; i < 3; i++) {
      const rec = { propValueId: 'pv1', selectedSpecs: { size: 'M' }, confidence: 0.3, matchMethod: 'coverage' as const };
      evaluator.recordOutcome(rec, 'spec_rejected');
      collector.collect('spec_override', `s${i}`, `u${i}`, 'wrong size', 'try M', lowCoverageTrace, rec);
    }

    expect(collector.isReadyForAnalysis()).toBe(true);
    const batch = collector.drainPool();

    const analyzer = new BadCaseAnalyzer();
    const clusters = analyzer.analyze(batch);
    const top = clusters[0];
    expect(top.mode).toBe('low_coverage_match');

    const advisor = new TuningAdvisor({
      FEATURE_PRIORITY: { getValue: () => ['height', 'weight', 'bust', 'waistline', 'footLength'] },
    });
    const recommendation = advisor.recommend(top);
    expect(recommendation).not.toBeNull();
    expect(recommendation!.knob).toBe('FEATURE_PRIORITY');

    const metrics = evaluator.evaluate();
    expect(metrics.accuracyRate).toBe(0);

    expect(recommendation!.reason).toContain('low coverage');
  });
});
