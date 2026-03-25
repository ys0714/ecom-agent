import type { Order, GenderSpecProfile, GenderRole, NumericRange } from '../../../domain/types.js';
import { UserProfileEntity } from '../../../domain/entities/user-profile.entity.js';

interface ParsedSpec {
  role: GenderRole;
  weight?: NumericRange;
  height?: NumericRange;
  waistline?: NumericRange;
  bust?: NumericRange;
  footLength?: NumericRange;
  size?: string;
  bottomSize?: string;
  shoeSize?: string;
}

const RANGE_PATTERN = /(\d+(?:\.\d+)?)\s*[-~到]\s*(\d+(?:\.\d+)?)/;

function parseRange(text: string, keyword: string): NumericRange | undefined {
  const idx = text.indexOf(keyword);
  if (idx === -1) return undefined;
  const segment = text.slice(idx, idx + keyword.length + 30);
  const match = segment.match(RANGE_PATTERN);
  if (!match) return undefined;
  return [parseFloat(match[1]), parseFloat(match[2])];
}

function parseSingleSize(text: string): string | undefined {
  const match = text.match(/尺码[：:]\s*([A-Z0-9]+)/i);
  return match?.[1]?.toUpperCase().replace('XXL', '2XL').replace('XXXL', '3XL');
}

function parseShoeSize(text: string): string | undefined {
  const match = text.match(/鞋码[：:]\s*(\d+)/);
  return match?.[1];
}

function inferRole(category: string): GenderRole {
  if (category.includes('male') && !category.includes('female')) return 'male';
  if (category.includes('child')) return 'child';
  return 'female';
}

function parseSpecDescription(desc: string, category: string): ParsedSpec {
  const role = inferRole(category);
  return {
    role,
    weight: parseRange(desc, '体重'),
    height: parseRange(desc, '身高'),
    waistline: parseRange(desc, '腰围'),
    bust: parseRange(desc, '胸围'),
    footLength: parseRange(desc, '脚长'),
    size: parseSingleSize(desc),
    shoeSize: parseShoeSize(desc),
  };
}

/**
 * Analyze orders and build a UserProfileEntity from purchase history.
 */
export function buildProfileFromOrders(userId: string, orders: Order[]): UserProfileEntity {
  const entity = new UserProfileEntity(userId);

  for (const order of orders) {
    for (const item of order.items) {
      const parsed = parseSpecDescription(item.specDescription, item.category);

      const delta: Record<string, unknown> = { role: parsed.role };
      if (parsed.weight) delta.weight = parsed.weight;
      if (parsed.height) delta.height = parsed.height;
      if (parsed.waistline) delta.waistline = parsed.waistline;
      if (parsed.bust) delta.bust = parsed.bust;
      if (parsed.footLength) delta.footLength = parsed.footLength;
      if (parsed.size) delta.size = [parsed.size];
      if (parsed.shoeSize) delta.shoeSize = [parsed.shoeSize];

      entity.applyDelta({
        dimensionId: 'specPreference',
        delta,
        source: 'order_history',
        timestamp: order.createdAt,
      });
    }
  }

  entity.setMeta({
    totalOrders: orders.length,
    lastOrderAt: orders.length > 0
      ? orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt
      : '',
    dataFreshness: 1.0,
  });

  return entity;
}
