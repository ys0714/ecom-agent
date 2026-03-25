import { describe, it, expect } from 'vitest';
import { config } from '../../src/infra/config.js';

describe('config', () => {
  it('loads default values when env vars are not set', () => {
    expect(config.server.port).toBe(3000);
    expect(config.business.slidingWindowSize).toBe(10);
    expect(config.business.badcaseBatchSize).toBe(50);
    expect(config.business.abTrafficRatio).toBe(0.1);
  });

  it('has valid path structure', () => {
    expect(config.paths.dataDir).toBeTruthy();
    expect(config.paths.profiles).toContain('profiles');
    expect(config.paths.sessions).toContain('sessions');
  });

  it('has LLM configuration', () => {
    expect(config.llm.modelId).toBeTruthy();
    expect(config.llm.timeoutMs).toBeGreaterThan(0);
  });
});
