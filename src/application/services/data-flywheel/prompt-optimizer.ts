import type { FailureModeCluster } from './badcase-analyzer.js';

export interface PromptCandidate {
  id: string;
  template: string;
  targetMode: string;
  createdAt: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'deployed';
}

/**
 * Generates prompt optimization candidates based on badcase clusters.
 * In production, this calls a large model (72B) to generate improved prompts.
 * For MVP, it produces structured suggestions for human review.
 */
export class PromptOptimizer {
  generateCandidates(clusters: FailureModeCluster[]): PromptCandidate[] {
    const candidates: PromptCandidate[] = [];

    for (const cluster of clusters) {
      if (cluster.count < 3) continue;

      candidates.push({
        id: `prompt_${Date.now()}_${cluster.mode}`,
        template: this.suggestImprovement(cluster),
        targetMode: cluster.mode,
        createdAt: new Date().toISOString(),
        status: 'pending_review',
      });
    }

    return candidates.slice(0, 3);
  }

  private suggestImprovement(cluster: FailureModeCluster): string {
    const suggestions: Record<string, string> = {
      spec_mismatch: '增加规格推荐时的置信度阈值，低于 0.6 时不主动推荐，改为询问用户偏好。',
      profile_inaccurate: '在画像不完整时（completeness < 0.5），优先询问而非推断。',
      tone_inappropriate: '增加安抚话术模板，投诉场景先表达歉意再处理问题。',
      context_lost: '增大滑动窗口 K 值，或在超长对话中保留关键摘要。',
      unknown: '需要人工分析具体 badcase 模式。',
    };
    return suggestions[cluster.mode] ?? suggestions['unknown'];
  }
}
