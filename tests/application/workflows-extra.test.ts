import { describe, it, expect, vi } from 'vitest';
import { createAfterSaleWorkflow, type AfterSaleState } from '../../src/application/workflow/after-sale.js';
import { createLogisticsWorkflow, type LogisticsState } from '../../src/application/workflow/logistics.js';
import { createComplaintWorkflow, type ComplaintState } from '../../src/application/workflow/complaint.js';
import { LLMJudge } from '../../src/application/services/evaluation/llm-judge.js';
import type { Message } from '../../src/domain/types.js';

describe('AfterSaleWorkflow', () => {
  it('identifies refund issue type', async () => {
    const wf = createAfterSaleWorkflow();
    const state: AfterSaleState = {
      currentNode: 'issue_identify', userMessage: '我要退款',
      issueType: 'unknown', orderId: null, resolved: false, response: '',
    };
    const result = await wf.step(state);
    expect(result.issueType).toBe('refund');
    expect(result.currentNode).toBe('order_lookup');
  });

  it('asks for order when orderId is null', async () => {
    const wf = createAfterSaleWorkflow();
    const state: AfterSaleState = {
      currentNode: 'order_lookup', userMessage: '',
      issueType: 'refund', orderId: null, resolved: false, response: '',
    };
    const result = await wf.step(state);
    expect(result.response).toContain('订单号');
  });
});

describe('LogisticsWorkflow', () => {
  it('asks for order when no orderId', async () => {
    const wf = createLogisticsWorkflow();
    const state: LogisticsState = {
      currentNode: 'order_identify', userMessage: '快递到哪了',
      orderId: null, trackingInfo: null, response: '',
    };
    const result = await wf.step(state);
    expect(result.response).toContain('订单号');
  });

  it('shows tracking when orderId provided', async () => {
    const wf = createLogisticsWorkflow();
    const state: LogisticsState = {
      currentNode: 'order_identify', userMessage: '',
      orderId: 'ord_001', trackingInfo: null, response: '',
    };
    const s1 = await wf.step(state);
    expect(s1.currentNode).toBe('tracking');

    const s2 = await wf.step(s1);
    expect(s2.response).toContain('送达');
  });
});

describe('ComplaintWorkflow', () => {
  it('starts with empathetic response', async () => {
    const wf = createComplaintWorkflow();
    const state: ComplaintState = {
      currentNode: 'issue_collect', userMessage: '你们的服务太差了',
      severity: 'low', issueDescription: '', resolved: false, response: '',
    };
    const result = await wf.step(state);
    expect(result.response).toContain('抱歉');
  });

  it('assesses high severity for fraud-related complaints', async () => {
    const wf = createComplaintWorkflow();
    const state: ComplaintState = {
      currentNode: 'severity_assess', userMessage: '这是假货，骗人的',
      severity: 'low', issueDescription: '', resolved: false, response: '',
    };
    const result = await wf.step(state);
    expect(result.severity).toBe('high');
  });
});

describe('LLMJudge', () => {
  it('evaluates conversation quality with mock LLM', async () => {
    const mockLLM = {
      chat: vi.fn().mockResolvedValue('{"helpfulness": 0.8, "correctness": 0.9, "safety": 1.0}'),
    };
    const judge = new LLMJudge(mockLLM);
    const messages: Message[] = [
      { role: 'user', content: '推荐尺码', timestamp: '' },
      { role: 'assistant', content: '推荐 L 码', timestamp: '' },
    ];
    const score = await judge.evaluate(messages);
    expect(score.helpfulness).toBe(0.8);
    expect(score.safety).toBe(1.0);
    expect(score.overall).toBeGreaterThan(0);
  });

  it('returns zeros on LLM failure', async () => {
    const mockLLM = { chat: vi.fn().mockRejectedValue(new Error('down')) };
    const judge = new LLMJudge(mockLLM);
    const score = await judge.evaluate([]);
    expect(score.overall).toBe(0);
  });
});
