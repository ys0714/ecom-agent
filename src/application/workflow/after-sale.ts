import { WorkflowGraph } from './workflow-graph.js';

export interface AfterSaleState {
  currentNode: string;
  userMessage: string;
  issueType: 'refund' | 'exchange' | 'repair' | 'unknown';
  orderId: string | null;
  resolved: boolean;
  response: string;
}

export function createAfterSaleWorkflow() {
  return new WorkflowGraph<AfterSaleState>()
    .addNode('issue_identify', async (state) => {
      const msg = state.userMessage.toLowerCase();
      let issueType: AfterSaleState['issueType'] = 'unknown';
      if (msg.includes('退款') || msg.includes('退钱')) issueType = 'refund';
      else if (msg.includes('换货') || msg.includes('换一个')) issueType = 'exchange';
      else if (msg.includes('维修') || msg.includes('修')) issueType = 'repair';
      return { ...state, issueType };
    })
    .addNode('order_lookup', async (state) => ({
      ...state,
      response: state.orderId
        ? `已找到订单 ${state.orderId}，正在处理您的${state.issueType === 'refund' ? '退款' : '换货'}请求。`
        : '请提供您的订单号，我帮您查询。',
    }))
    .addNode('solution_propose', async (state) => ({
      ...state,
      response: `针对您的${state.issueType}问题，建议方案如下：请联系人工客服确认具体处理方式。`,
    }))
    .addNode('execute', async (state) => ({
      ...state, resolved: true,
      response: '已为您提交处理申请，预计 1-3 个工作日内处理完成。还有其他问题吗？',
    }))
    .addEdge('issue_identify', 'order_lookup')
    .addConditionalEdge('order_lookup', (s) => s.orderId ? 'solution_propose' : 'order_lookup')
    .addEdge('solution_propose', 'execute')
    .setEntryPoint('issue_identify')
    .compile();
}
