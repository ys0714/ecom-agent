import { describe, it, expect } from 'vitest';
import { WorkflowGraph, WorkflowRegistry } from '../../src/application/workflow/workflow-graph.js';
import { createProductConsultWorkflow, type ConsultState } from '../../src/application/workflow/product-consult.js';
import { IntentRouter, classifyByRules } from '../../src/application/workflow/intent-router.js';

describe('WorkflowGraph', () => {
  it('compiles and steps through nodes', async () => {
    interface TestState { currentNode: string; count: number }

    const wf = new WorkflowGraph<TestState>()
      .addNode('start', async (s) => ({ ...s, count: s.count + 1 }))
      .addNode('end', async (s) => ({ ...s, count: s.count + 10 }))
      .addEdge('start', 'end')
      .setEntryPoint('start')
      .compile();

    let state: TestState = { currentNode: 'start', count: 0 };
    state = await wf.step(state);
    expect(state.count).toBe(1);
    expect(state.currentNode).toBe('end');

    state = await wf.step(state);
    expect(state.count).toBe(11);
  });

  it('supports conditional edges', async () => {
    interface TestState { currentNode: string; ready: boolean }

    const wf = new WorkflowGraph<TestState>()
      .addNode('check', async (s) => s)
      .addNode('proceed', async (s) => s)
      .addNode('wait', async (s) => s)
      .addConditionalEdge('check', (s) => s.ready ? 'proceed' : 'wait')
      .setEntryPoint('check')
      .compile();

    const s1 = await wf.step({ currentNode: 'check', ready: true });
    expect(s1.currentNode).toBe('proceed');

    const s2 = await wf.step({ currentNode: 'check', ready: false });
    expect(s2.currentNode).toBe('wait');
  });

  it('throws on missing entry point', () => {
    expect(() => new WorkflowGraph().compile()).toThrow('Entry point not set');
  });

  it('lists node IDs', () => {
    const wf = new WorkflowGraph<{ currentNode: string }>()
      .addNode('a', async (s) => s)
      .addNode('b', async (s) => s)
      .setEntryPoint('a')
      .compile();

    expect(wf.getNodeIds()).toEqual(['a', 'b']);
  });
});

describe('ProductConsultWorkflow', () => {
  it('steps through greeting → need_analysis', async () => {
    const wf = createProductConsultWorkflow();
    const initial: ConsultState = {
      currentNode: 'greeting', userMessage: '', hasEnoughInfo: false,
      recommendation: null, userSatisfied: false, response: '',
    };

    const afterGreeting = await wf.step(initial);
    expect(afterGreeting.response).toContain('您好');
    expect(afterGreeting.currentNode).toBe('need_analysis');
  });
});

describe('WorkflowRegistry', () => {
  it('registers and retrieves workflows', () => {
    const registry = new WorkflowRegistry();
    const wf = createProductConsultWorkflow();
    registry.register('product_consult', wf);

    expect(registry.get('product_consult')).toBe(wf);
    expect(registry.listTypes()).toEqual(['product_consult']);
    expect(registry.get('after_sale')).toBeUndefined();
  });
});

describe('IntentRouter', () => {
  it('classifies product consultation by keywords', () => {
    const result = classifyByRules('我想买一件外套，推荐一下');
    expect(result?.intent).toBe('product_consult');
  });

  it('classifies after-sale by keywords', () => {
    const result = classifyByRules('我要退货');
    expect(result?.intent).toBe('after_sale');
  });

  it('classifies logistics by keywords', () => {
    const result = classifyByRules('快递到哪了');
    expect(result?.intent).toBe('logistics');
  });

  it('classifies complaint by keywords', () => {
    const result = classifyByRules('我要投诉');
    expect(result?.intent).toBe('complaint');
  });

  it('returns null for unrecognized input', () => {
    const result = classifyByRules('你好');
    expect(result).toBeNull();
  });

  it('IntentRouter.classify falls back to general', async () => {
    const router = new IntentRouter();
    const result = await router.classify({ role: 'user', content: '你好', timestamp: '' });
    expect(result.intent).toBe('general');
  });
});
