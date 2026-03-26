import type { Order, GenderSpecProfile, GenderRole, NumericRange, Message } from '../../../domain/types.js';
import { UserProfileEntity } from '../../../domain/entities/user-profile.entity.js';
import type { LLMClient } from '../../../infra/adapters/llm.js';

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

function parseSpecDescriptionFallback(desc: string, category: string): ParsedSpec {
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

async function parseSpecDescriptionWithLLM(desc: string, category: string, llm: LLMClient): Promise<ParsedSpec> {
  const prompt = `你是一个专业的电商商品特征提取专家。请从以下商品信息中提取身体特征画像。
商品类目：${category}
商品规格描述：${desc}

要求：
1. 提取的信息必须是 JSON 格式。
2. 包含字段：weight (体重区间，斤，如 [100, 120]), height (身高区间，cm，如 [160, 170]), waistline (腰围区间，cm), bust (胸围区间，cm), footLength (脚长区间，mm), size (上装尺码，如 "M"), bottomSize (下装尺码), shoeSize (鞋码)。如果没有相关信息，请省略该字段或设为 null。
3. 尺码格式标准化：XXL 改为 2XL。
4. 返回纯 JSON，不要有任何 markdown 标记（如 \`\`\`json ）。`;

  try {
    const response = await llm.chat([{ role: 'user', content: prompt, timestamp: '' }], { temperature: 0.1 });
    const parsed = JSON.parse(response.trim());
    return {
      role: inferRole(category),
      ...parsed
    };
  } catch (err) {
    // Fallback to regex if LLM fails (e.g. invalid JSON)
    return parseSpecDescriptionFallback(desc, category);
  }
}

/**
 * Analyze orders and build a UserProfileEntity from purchase history.
 */
export async function buildProfileFromOrders(userId: string, orders: Order[], llmClient?: LLMClient): Promise<UserProfileEntity> {
  const entity = new UserProfileEntity(userId);

  for (const order of orders) {
    for (const item of order.items) {
      const parsed = llmClient
        ? await parseSpecDescriptionWithLLM(item.specDescription, item.category, llmClient)
        : parseSpecDescriptionFallback(item.specDescription, item.category);

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
