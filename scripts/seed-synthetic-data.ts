import { vectorStore, VectorDocument } from '../src/infra/adapters/vector-store.js';
import { createLLMClient } from '../src/infra/adapters/llm.js';
import { config } from '../src/infra/config.js';
import { randomUUID } from 'node:crypto';

// 典型的电商客服 Bad Case 与正确修正（Synthetic Few-shot Examples）
const hardcodedData = [
  {
    category: '尺码纠正',
    user_query: '推荐的M码太紧了，我平时喜欢穿宽松点，我要L码',
    bad_response: '根据您的画像（身高160cm，体重50kg），M码是最合适的，建议您还是购买M码。',
    good_response: '好的，已经为您记录“偏好宽松”。这款L码对您来说会更宽松舒适，我帮您推荐L码。',
    reason: '用户表达了明确的主观偏好（偏好宽松），系统应直接接受并覆写规则，而不应固执己见坚持覆盖率算法的推荐结果。'
  },
  {
    category: '角色切换',
    user_query: '我老公身高175，体重140斤，这件男装夹克穿多大？',
    bad_response: '根据您的画像（女性，身高160cm，体重50kg），这件男装夹克您穿可能会太大了，不建议您购买。',
    good_response: '看来您是在为他人选购。针对身高175cm、体重140斤的男士，这件夹克推荐 L 码哦。',
    reason: '用户明确表示为他人购买，且给出了新的规格数据。模型应识别角色切换，脱离当前用户画像，使用临时画像进行推荐。'
  },
  {
    category: '超限/拦截',
    user_query: '你们这衣服太便宜了，给我来1000件',
    bad_response: '好的，马上为您下单1000件衣服，感谢您的支持！',
    good_response: '抱歉，为了保障更多用户的权益，我们的系统单笔订单限购10件哦。如果您有大宗采购需求，可以为您转接人工客服处理。',
    reason: '大额或异常数量购买应当触发 Guardrails 拦截，不能产生未经授权的承诺。'
  },
  {
    category: '不支持的商品建议',
    user_query: '我怀孕6个月了，这件紧身针织裙我能穿吗？',
    bad_response: '可以的，根据您的身高体重，建议您购买 L 码。',
    good_response: '这款针织裙是紧身修身版型，可能不太适合孕期的准妈妈哦。建议您看下我们店里的孕妇专区或者宽松版型的连衣裙，穿着会更舒适。',
    reason: '对于孕妇等特殊体型或场景，模型不能无脑推荐常规尺码，需要理解款式限制并给出合理的建议。'
  },
  {
    category: '意图路由跳变',
    user_query: '昨天买的衣服发货了吗？如果还没发货帮我把尺码换成L码',
    bad_response: '好的，这款衣服L码适合您，这就为您换成L码。',
    good_response: '我帮您查询一下物流状态。您的订单昨天已经发货了哦，现在无法直接修改尺码。您可以等收到货后试试，如果不合适支持七天无理由退换货的。',
    reason: '存在多个意图（物流查询+修改订单），需要先确认订单状态（物流节点），再决定是否能执行修改尺码的动作。'
  }
];

async function generateMoreSyntheticData(count: number = 3) {
  const llm = createLLMClient({
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    modelId: config.llm.modelId,
  });

  const prompt = `你是一个电商领域的测试工程师。请生成 ${count} 个电商客服对话中的 "Bad Case"（失败案例）及其修正版本。
要求涵盖不同分类，例如：话术生硬、未能结合历史上下文、退换货规则理解错误等。
输出必须是纯 JSON 数组格式，不要包含 Markdown 代码块标记（如 \`\`\`json），每个对象包含：
- category (分类字符串)
- user_query (用户说的话)
- bad_response (错误的回复)
- good_response (理想的正确回复)
- reason (错误原因分析)`;

  try {
    console.log(`正在调用 LLM (${config.llm.modelId}) 生成额外 ${count} 条合成数据...`);
    const response = await llm.chat([{ role: 'user', content: prompt }], { temperature: 0.8 });
    const text = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
    const generated = JSON.parse(text);
    return generated;
  } catch (error) {
    console.error('LLM 生成数据失败，将仅使用预设数据。', error);
    return [];
  }
}

async function main() {
  console.log('正在初始化向量数据库连接...');
  await vectorStore.initialize();

  // 1. 获取预设数据
  let syntheticData = [...hardcodedData];

  // 2. 使用大模型生成额外数据
  const generatedData = await generateMoreSyntheticData(3);
  if (Array.isArray(generatedData) && generatedData.length > 0) {
    syntheticData = syntheticData.concat(generatedData);
    console.log(`成功将 ${generatedData.length} 条 LLM 生成的数据加入集合。`);
  }

  const docs: VectorDocument[] = syntheticData.map(data => {
    // 将整个上下文拼接成一段文本，作为向量嵌入的输入
    const text = `
用户输入: ${data.user_query}
错误回复: ${data.bad_response}
分析原因: ${data.reason}
修正后回复: ${data.good_response}
`.trim();

    return {
      id: randomUUID(),
      text,
      metadata: {
        category: data.category,
        type: 'synthetic_fewshot',
        created_at: new Date().toISOString()
      }
    };
  });

  console.log(`准备写入共 ${docs.length} 条合成数据作为冷启动 Few-shot 样本...`);
  await vectorStore.addDocuments(docs);
  console.log('写入完成！可以通过查询进行验证。');

  // 验证查询
  console.log('\n--- 验证查询 ---');
  const testQuery = '帮我朋友买一件男装，他180高';
  console.log(`搜索: "${testQuery}"`);
  const results = await vectorStore.search(testQuery, 2);
  
  results.forEach((res, i) => {
    console.log(`\n结果 ${i + 1} (距离: ${res.distance.toFixed(4)})`);
    console.log(res.text);
  });
}

main().catch(console.error);