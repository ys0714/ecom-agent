import { WorkflowGraph } from './workflow-graph.js';

export interface ComplaintState {
  currentNode: string;
  userMessage: string;
  severity: 'low' | 'medium' | 'high';
  issueDescription: string;
  resolved: boolean;
  response: string;
}

export function createComplaintWorkflow() {
  return new WorkflowGraph<ComplaintState>()
    .addNode('issue_collect', async (state) => ({
      ...state,
      issueDescription: state.userMessage,
      response: '非常抱歉给您带来不好的体验，请详细描述一下您遇到的问题，我会尽快为您处理。',
    }))
    .addNode('severity_assess', async (state) => {
      const msg = state.userMessage.toLowerCase();
      let severity: ComplaintState['severity'] = 'low';
      if (msg.includes('骗') || msg.includes('欺诈') || msg.includes('假货')) severity = 'high';
      else if (msg.includes('投诉') || msg.includes('差评')) severity = 'medium';
      return { ...state, severity };
    })
    .addNode('resolution', async (state) => ({
      ...state,
      response: state.severity === 'high'
        ? '您的问题我们非常重视，已为您转接专属客服处理。'
        : '已记录您的反馈，我们会在 24 小时内给您回复处理结果。',
    }))
    .addNode('followup', async (state) => ({
      ...state, resolved: true,
      response: '感谢您的反馈，我们会持续改进服务。如有其他问题随时联系我们。',
    }))
    .addEdge('issue_collect', 'severity_assess')
    .addConditionalEdge('severity_assess', (s) =>
      s.severity === 'high' ? 'resolution' : 'resolution')
    .addEdge('resolution', 'followup')
    .setEntryPoint('issue_collect')
    .compile();
}
