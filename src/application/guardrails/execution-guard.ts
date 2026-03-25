import type { GuardrailResult, WorkflowType } from '../../domain/types.js';

const WORKFLOW_TOOL_WHITELIST: Record<WorkflowType, string[]> = {
  product_consult: ['search_product', 'get_product_detail', 'recommend_spec', 'get_profile'],
  after_sale: ['get_order', 'create_refund', 'create_exchange', 'get_policy'],
  logistics: ['get_order', 'track_logistics'],
  complaint: ['get_order', 'create_ticket', 'offer_compensation', 'transfer_human'],
  general: ['get_profile'],
};

export interface ExecutionGuardConfig {
  maxCompensationAmount?: number;
  dailyOperationLimit?: number;
}

export class ExecutionGuard {
  private operationCounts = new Map<string, number>();
  private maxCompensation: number;
  private dailyLimit: number;

  constructor(config?: ExecutionGuardConfig) {
    this.maxCompensation = config?.maxCompensationAmount ?? 50;
    this.dailyLimit = config?.dailyOperationLimit ?? 10;
  }

  checkToolPermission(toolName: string, workflow: WorkflowType): GuardrailResult {
    const allowed = WORKFLOW_TOOL_WHITELIST[workflow] ?? [];
    if (!allowed.includes(toolName)) {
      return {
        passed: false, blockedBy: 'execution',
        reason: `工具 "${toolName}" 不允许在 "${workflow}" 场景中使用`,
      };
    }
    return { passed: true };
  }

  checkCompensationAmount(amount: number): GuardrailResult {
    if (amount > this.maxCompensation) {
      return {
        passed: false, blockedBy: 'execution',
        reason: `补偿金额 ${amount} 超过上限 ${this.maxCompensation}`,
      };
    }
    return { passed: true };
  }

  checkOperationLimit(userId: string, operation: string): GuardrailResult {
    const key = `${userId}:${operation}:${new Date().toISOString().slice(0, 10)}`;
    const count = (this.operationCounts.get(key) ?? 0) + 1;
    this.operationCounts.set(key, count);

    if (count > this.dailyLimit) {
      return {
        passed: false, blockedBy: 'execution',
        reason: `操作 "${operation}" 今日次数已达上限 ${this.dailyLimit}`,
      };
    }
    return { passed: true };
  }

  resetDailyCounts(): void {
    this.operationCounts.clear();
  }
}
