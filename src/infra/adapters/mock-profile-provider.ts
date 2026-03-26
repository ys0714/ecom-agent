import { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';
import type { ProfileProvider } from '../../application/services/profile-provider.js';

/**
 * 独立画像提取系统（SPEC-A）的 Mock 数据提供者。
 * 在实际生产环境中，这部分数据将由离线系统（Profile Extraction System）提取，
 * Agent 系统可以通过 HTTP API 或直接读取共享存储（如 Redis）来获取。
 * 这里使用 Provider 模式进行隔离，支持后续一键切换到真实的外部画像服务。
 */
export class MockProfileProvider implements ProfileProvider {
  async getProfile(userId: string): Promise<UserProfileEntity | null> {
    const profiles: Record<string, UserProfileEntity> = {
      // ── web-user: Web 聊天面板默认测试用户，全画像（包含女装、男装、童装） ──
      'web-user': new UserProfileEntity('web-user', {
        defaultRole: 'female',
        femaleClothing: {
          weight: [100, 115],
          height: [160, 168],
          waistline: [66, 72],
          size: ['M'],
          shoeSize: ['37', '38'],
          footLength: [235, 245],
          bust: [82, 90],
          bottomSize: ['M'],
        },
        maleClothing: {
          weight: [145, 165],
          height: [175, 182],
          size: ['XL'],
          shoeSize: ['42'],
          footLength: [255, 260],
          waistline: null,
          bust: null,
          bottomSize: null,
        },
        childClothing: {
          weight: [35, 45],
          height: [115, 125],
          size: ['120'],
          shoeSize: null,
          footLength: null,
          waistline: null,
          bust: null,
          bottomSize: null,
        }
      }, { totalOrders: 15, dataFreshness: 1.0, lastOrderAt: new Date().toISOString() }),

      // ── cli-user: CLI 终端默认测试用户 ──
      'cli-user': new UserProfileEntity('cli-user', {
        defaultRole: 'female',
        femaleClothing: {
          weight: [100, 115],
          height: [160, 168],
          waistline: [66, 72],
          size: ['M'],
          shoeSize: ['37', '38'],
          footLength: [235, 245],
          bust: null,
          bottomSize: ['M'],
        }
      }, { totalOrders: 12, dataFreshness: 1.0, lastOrderAt: new Date().toISOString() }),

      // ── cold-user: 零画像用户，用于测试冷启动策略（系统应触发主动探测话术） ──
      'cold-user': new UserProfileEntity('cold-user', {
        defaultRole: 'female'
      }, { totalOrders: 0, dataFreshness: 0, lastOrderAt: '' }),
      
      // ── male-user: 男性为主的用户画像测试 ──
      'male-user': new UserProfileEntity('male-user', {
        defaultRole: 'male',
        maleClothing: {
          weight: [130, 155],
          height: [170, 180],
          size: ['L'],
          waistline: [82, 88],
          shoeSize: ['42'],
          footLength: [255, 260],
          bust: null,
          bottomSize: ['L']
        }
      }, { totalOrders: 8, dataFreshness: 1.0, lastOrderAt: new Date().toISOString() })
    };

    return profiles[userId] || null;
  }
}
