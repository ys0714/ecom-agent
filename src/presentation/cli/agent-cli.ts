#!/usr/bin/env node
import readline from 'node:readline';
import { config } from '../../infra/config.js';
import { createLLMClient } from '../../infra/adapters/llm.js';
import { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';
import { InMemoryEventBus, createEvent } from '../../domain/event-bus.js';
import { matchSpecs } from '../../application/services/profile-engine/spec-inference.js';
import type { Message, ProductInfo } from '../../domain/types.js';

const SLIDING_WINDOW_SIZE = config.business.slidingWindowSize;
const GUARDRAIL_INSTRUCTIONS = '你不能做出退款、赔偿等未经授权的承诺。不要暴露用户的手机号、地址等隐私信息。';

function buildSystemPrompt(profile: UserProfileEntity, workflow: string): string {
  const completeness = profile.getCompleteness();
  const profileSection = completeness >= 0.7
    ? `用户画像：${profile.summarizeForPrompt()}`
    : completeness >= 0.3
      ? `用户画像（积累中）：${profile.summarizeForPrompt()}。如用户未明确说明，可适当询问偏好。`
      : '暂无用户画像，请在对话中主动询问用户的身高、体重、常穿尺码等信息。';

  return `你是一个专业的电商客服，为用户提供商品规格推荐和购物咨询服务。

${profileSection}

当前场景：${workflow}
${workflow === 'complaint' ? '请以安抚为优先策略，耐心倾听用户诉求。' : ''}

${GUARDRAIL_INSTRUCTIONS}

回复要求：简洁专业，不超过200字。如果涉及规格推荐，请说明推荐理由。`;
}

async function main() {
  const eventBus = new InMemoryEventBus();

  eventBus.register({
    name: 'ConsoleLogger',
    subscribedEvents: ['message:user', 'message:assistant', 'model:inference'],
    handle: (event) => {
      if (event.type === 'model:inference') {
        const latency = event.payload.latencyMs as number;
        console.log(`  [inference] ${latency}ms`);
      }
    },
  });

  const llm = createLLMClient({
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    modelId: config.llm.modelId,
  });

  const profile = new UserProfileEntity('cli-user', {
    femaleClothing: {
      weight: [105, 115], height: [160, 170],
      waistline: null, bust: null, footLength: null,
      size: ['M', 'L'], bottomSize: ['M'],
      shoeSize: ['37', '38'],
    },
  });
  profile.setMeta({ totalOrders: 12, lastOrderAt: '2025-12-01T00:00:00Z' });

  const messages: Message[] = [];
  const systemMsg: Message = {
    role: 'system',
    content: buildSystemPrompt(profile, 'product_consult'),
    timestamp: new Date().toISOString(),
  };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('=== 电商客服 Agent CLI ===');
  console.log(`画像: ${profile.summarizeForPrompt()}`);
  console.log('输入 /quit 退出, /profile 查看画像\n');

  const sessionId = `cli-${Date.now()}`;
  eventBus.publish(createEvent('agent:start', { userId: profile.userId }, sessionId));

  const prompt = () => {
    rl.question('用户> ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }
      if (trimmed === '/quit') {
        eventBus.publish(createEvent('agent:stop', {}, sessionId));
        console.log('再见！');
        rl.close();
        return;
      }
      if (trimmed === '/profile') {
        console.log(JSON.stringify(profile.toJSON(), null, 2));
        prompt();
        return;
      }

      const userMsg: Message = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
      messages.push(userMsg);
      eventBus.publish(createEvent('message:user', { content: trimmed }, sessionId));

      const windowMessages = messages.slice(-SLIDING_WINDOW_SIZE);
      const contextMessages: Message[] = [systemMsg, ...windowMessages];

      try {
        const startTime = Date.now();
        const response = await llm.chat(contextMessages);
        const latencyMs = Date.now() - startTime;

        eventBus.publish(createEvent('model:inference', { latencyMs, model: config.llm.modelId }, sessionId));

        const assistantMsg: Message = { role: 'assistant', content: response, timestamp: new Date().toISOString() };
        messages.push(assistantMsg);
        eventBus.publish(createEvent('message:assistant', { content: response }, sessionId));

        console.log(`\n客服> ${response}\n`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`\n[错误] LLM 调用失败: ${errMsg}\n`);
        eventBus.publish(createEvent('system:error', { error: errMsg }, sessionId));
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
