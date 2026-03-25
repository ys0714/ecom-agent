import { WorkflowGraph } from './workflow-graph.js';
import type { Message, SpecRecommendation } from '../../domain/types.js';

export interface ConsultState {
  currentNode: string;
  userMessage: string;
  hasEnoughInfo: boolean;
  recommendation: SpecRecommendation | null;
  userSatisfied: boolean;
  response: string;
}

export function createProductConsultWorkflow() {
  return new WorkflowGraph<ConsultState>()
    .addNode('greeting', async (state) => ({
      ...state,
      response: '您好！请问想看什么商品呢？',
    }))
    .addNode('need_analysis', async (state) => {
      const hasInfo = state.userMessage.length > 5;
      return { ...state, hasEnoughInfo: hasInfo };
    })
    .addNode('recommendation', async (state) => ({
      ...state,
      response: state.recommendation
        ? `推荐规格：${JSON.stringify(state.recommendation.selectedSpecs)}（匹配度 ${Math.round(state.recommendation.confidence * 100)}%）`
        : '抱歉，暂时无法为您推荐合适的规格，请提供更多信息。',
    }))
    .addNode('spec_selection', async (state) => ({
      ...state,
      response: '好的，已为您选择该规格。还有其他需要吗？',
    }))
    .addNode('confirmation', async (state) => ({
      ...state,
      response: '感谢您的购买，祝您购物愉快！',
    }))
    .addEdge('greeting', 'need_analysis')
    .addConditionalEdge('need_analysis', (state) =>
      state.hasEnoughInfo ? 'recommendation' : 'need_analysis')
    .addConditionalEdge('recommendation', (state) =>
      state.userSatisfied ? 'spec_selection' : 'need_analysis')
    .addEdge('spec_selection', 'confirmation')
    .setEntryPoint('greeting')
    .compile();
}
