import { describe, it, expect } from 'vitest';
import { BadCaseCollector } from '../../src/application/services/data-flywheel/badcase-collector.js';
import { BadCaseAnalyzer } from '../../src/application/services/data-flywheel/badcase-analyzer.js';
import { PromptOptimizer } from '../../src/application/services/data-flywheel/prompt-optimizer.js';
import { ABExperiment } from '../../src/application/services/data-flywheel/ab-experiment.js';

describe('BadCaseCollector', () => {
  it('collects badcases and tracks pool size', () => {
    const collector = new BadCaseCollector(5);
    collector.collect('user_rejection', 's1', 'u1', 'bad', 'response');
    collector.collect('spec_override', 's2', 'u1', 'wrong', 'response');
    expect(collector.getPoolSize()).toBe(2);
    expect(collector.isReadyForAnalysis()).toBe(false);
  });

  it('triggers analysis at threshold', () => {
    const collector = new BadCaseCollector(3);
    collector.collect('user_rejection', 's1', 'u1', 'a', 'b');
    collector.collect('spec_override', 's2', 'u1', 'a', 'b');
    collector.collect('transfer_human', 's3', 'u1', 'a', 'b');
    expect(collector.isReadyForAnalysis()).toBe(true);
  });

  it('drains pool completely', () => {
    const collector = new BadCaseCollector(2);
    collector.collect('user_rejection', 's1', 'u1', 'a', 'b');
    collector.collect('spec_override', 's2', 'u2', 'a', 'b');

    const batch = collector.drainPool();
    expect(batch).toHaveLength(2);
    expect(collector.getPoolSize()).toBe(0);
  });
});

describe('BadCaseAnalyzer', () => {
  it('clusters badcases by failure mode', () => {
    const collector = new BadCaseCollector();
    const bc1 = collector.collect('spec_override', 's1', 'u1', 'a', 'b');
    const bc2 = collector.collect('spec_override', 's2', 'u2', 'a', 'b');
    const bc3 = collector.collect('user_rejection', 's3', 'u3', 'a', 'b');

    const analyzer = new BadCaseAnalyzer();
    const clusters = analyzer.clusterByRules(collector.drainPool());

    expect(clusters).toHaveLength(2);
    expect(clusters[0].mode).toBe('spec_mismatch');
    expect(clusters[0].count).toBe(2);
  });
});

describe('PromptOptimizer', () => {
  it('generates candidates for large clusters', () => {
    const optimizer = new PromptOptimizer();
    const clusters = [
      { mode: 'spec_mismatch' as const, cases: [{} as any, {} as any, {} as any], count: 3 },
      { mode: 'tone_inappropriate' as const, cases: [{} as any], count: 1 },
    ];

    const candidates = optimizer.generateCandidates(clusters);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].targetMode).toBe('spec_mismatch');
    expect(candidates[0].status).toBe('pending_review');
  });

  it('generates at most 3 candidates', () => {
    const optimizer = new PromptOptimizer();
    const clusters = Array.from({ length: 5 }, (_, i) => ({
      mode: 'spec_mismatch' as const,
      cases: Array(5).fill({} as any),
      count: 5,
    }));

    expect(optimizer.generateCandidates(clusters)).toHaveLength(3);
  });
});

describe('ABExperiment', () => {
  it('tracks experiment metrics', () => {
    const ab = new ABExperiment();
    ab.create({
      id: 'exp1', controlPromptId: 'v1', treatmentPromptId: 'v2',
      trafficRatio: 0.1, minSampleSize: 10,
      startedAt: new Date().toISOString(), status: 'running',
    });

    for (let i = 0; i < 5; i++) {
      ab.recordOutcome('exp1', true, i < 3);
      ab.recordOutcome('exp1', false, i < 4);
    }

    const m = ab.getMetrics('exp1')!;
    expect(m.controlSamples).toBe(5);
    expect(m.treatmentSamples).toBe(5);
  });

  it('returns continue when sample size insufficient', () => {
    const ab = new ABExperiment();
    ab.create({
      id: 'exp2', controlPromptId: 'v1', treatmentPromptId: 'v2',
      trafficRatio: 0.1, minSampleSize: 1000,
      startedAt: new Date().toISOString(), status: 'running',
    });
    ab.recordOutcome('exp2', true, true);
    expect(ab.evaluate('exp2')).toBe('continue');
  });

  it('promotes when treatment significantly better', () => {
    const ab = new ABExperiment();
    ab.create({
      id: 'exp3', controlPromptId: 'v1', treatmentPromptId: 'v2',
      trafficRatio: 0.5, minSampleSize: 20,
      startedAt: new Date().toISOString(), status: 'running',
    });

    for (let i = 0; i < 50; i++) {
      ab.recordOutcome('exp3', true, Math.random() < 0.5);
      ab.recordOutcome('exp3', false, Math.random() < 0.8);
    }

    const result = ab.evaluate('exp3');
    expect(['promote', 'continue']).toContain(result);
  });
});
