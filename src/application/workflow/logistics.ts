import { WorkflowGraph } from './workflow-graph.js';

export interface LogisticsState {
  currentNode: string;
  userMessage: string;
  orderId: string | null;
  trackingInfo: string | null;
  response: string;
}

export function createLogisticsWorkflow() {
  return new WorkflowGraph<LogisticsState>()
    .addNode('order_identify', async (state) => ({
      ...state,
      response: state.orderId ? '正在查询物流信息...' : '请提供您的订单号，我帮您查询物流。',
    }))
    .addNode('tracking', async (state) => ({
      ...state,
      trackingInfo: state.orderId ? '快递已到达当地转运中心' : null,
      response: state.orderId
        ? '您的快递已到达当地转运中心，预计明天送达。'
        : '未能查询到物流信息，请确认订单号是否正确。',
    }))
    .addNode('eta_notify', async (state) => ({
      ...state,
      response: '预计送达时间已通知，如有变化我会及时告知您。还有其他问题吗？',
    }))
    .addConditionalEdge('order_identify', (s) => s.orderId ? 'tracking' : 'order_identify')
    .addEdge('tracking', 'eta_notify')
    .setEntryPoint('order_identify')
    .compile();
}
