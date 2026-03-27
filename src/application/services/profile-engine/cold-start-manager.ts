import type { ColdStartStage, Message } from '../../../domain/types.js';
import { UserProfileEntity } from '../../../domain/entities/user-profile.entity.js';

export type ColdStartAction =
  | { type: 'ask_preference'; question: string }
  | { type: 'use_popular'; reason: string }
  | { type: 'normal' };

const PROBING_QUESTIONS: string[] = [
  '请问您的身高和体重大概是多少呢？方便我为您推荐合适的尺码。',
  '您平时穿衣服一般穿什么尺码呢？（如 S/M/L/XL）',
  '请问您的鞋码是多少呢？',
  '您平时购物的预算范围大概是多少呢？',
];

/**
 * Manages cold-start behavior for users without sufficient profile data.
 * Returns an action that the agent loop should take based on profile completeness.
 */
const MAX_USER_CACHE = 500;

export class ColdStartManager {
  private askedByUser = new Map<string, Set<string>>();

  private getAsked(userId: string): Set<string> {
    let set = this.askedByUser.get(userId);
    if (set) {
      this.askedByUser.delete(userId);
      this.askedByUser.set(userId, set);
      return set;
    }
    set = new Set();
    this.askedByUser.set(userId, set);
    if (this.askedByUser.size > MAX_USER_CACHE) {
      const oldest = this.askedByUser.keys().next().value;
      if (oldest) this.askedByUser.delete(oldest);
    }
    return set;
  }

  getAction(profile: UserProfileEntity, userId?: string): ColdStartAction {
    const key = userId ?? profile.userId;
    const stage = profile.getColdStartStage();

    switch (stage) {
      case 'cold':
        return this.getColdAction(key);
      case 'warm':
        return this.getWarmAction(profile, key);
      case 'hot':
        return { type: 'normal' };
    }
  }

  private getColdAction(userId: string): ColdStartAction {
    const asked = this.getAsked(userId);
    const unasked = PROBING_QUESTIONS.filter((q) => !asked.has(q));
    if (unasked.length > 0) {
      const question = unasked[0];
      asked.add(question);
      return { type: 'ask_preference', question };
    }
    return { type: 'use_popular', reason: '用户画像不足，推荐热门商品' };
  }

  private getWarmAction(profile: UserProfileEntity, userId: string): ColdStartAction {
    const gp = profile.getGenderProfile();
    if (!gp) return this.getColdAction(userId);

    const missing: string[] = [];
    if (!gp.height) missing.push('身高');
    if (!gp.weight) missing.push('体重');
    if (!gp.size) missing.push('尺码');

    const asked = this.getAsked(userId);
    if (missing.length > 0 && !asked.has('warm_probe')) {
      asked.add('warm_probe');
      return {
        type: 'ask_preference',
        question: `为了给您更精准的推荐，能告诉我您的${missing.join('和')}吗？`,
      };
    }

    return { type: 'normal' };
  }

  shouldFilterBadCase(profile: UserProfileEntity): boolean {
    return profile.getColdStartStage() === 'cold';
  }

  reset(userId?: string): void {
    if (userId) {
      this.askedByUser.delete(userId);
    } else {
      this.askedByUser.clear();
    }
  }
}
