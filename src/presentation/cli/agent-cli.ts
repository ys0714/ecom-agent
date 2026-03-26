#!/usr/bin/env node
import readline from 'node:readline';
import { config } from '../../infra/config.js';
import { createLLMClient } from '../../infra/adapters/llm.js';
import { InMemoryRedisClient } from '../../infra/adapters/redis.js';
import { MockOrderService } from '../../infra/adapters/order-service.js';
import { MockProductService } from '../../infra/adapters/product-service.js';
import { InMemoryEventBus, createEvent } from '../../domain/event-bus.js';
import { ProfileStore } from '../../application/services/profile-store.js';
import { ModelSlotManager } from '../../application/services/model-slot/model-slot-manager.js';
import { IntentRouter } from '../../application/workflow/intent-router.js';
import { ColdStartManager } from '../../application/services/profile-engine/cold-start-manager.js';
import { buildProfileFromOrders } from '../../application/services/profile-engine/order-analyzer.js';
import { Agent } from '../../application/agent.js';
import type { Message } from '../../domain/types.js';

async function main() {
  const eventBus = new InMemoryEventBus();
  const redis = new InMemoryRedisClient();
  const profileStore = new ProfileStore(redis, config.paths.profiles);
  const orderService = new MockOrderService();
  const productService = new MockProductService();

  eventBus.register({
    name: 'ConsoleLogger',
    subscribedEvents: ['model:inference', 'model:fallback', 'system:error'],
    handle: (event) => {
      if (event.type === 'model:inference') {
        console.log(`  [inference] ${event.payload.latencyMs}ms (${event.payload.model})`);
      } else if (event.type === 'model:fallback') {
        console.log(`  [fallback] ${event.payload.from} → ${event.payload.to}`);
      } else if (event.type === 'system:error') {
        console.error(`  [error] ${event.payload.error}`);
      }
    },
  });

  const llm = createLLMClient({
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    modelId: config.llm.modelId,
    timeoutMs: config.llm.timeoutMs,
  });

  const modelSlotManager = new ModelSlotManager(eventBus, () => llm);
  modelSlotManager.registerSlot('conversation', 'conversation',
    { name: config.llm.modelId, endpoint: config.llm.baseUrl, modelId: config.llm.modelId,
      maxTokens: 2048, temperature: 0.7, timeoutMs: config.llm.timeoutMs },
    { batchSize: 1, enableFallback: false, cacheTTL: 0, maxRetries: 2, retryDelayMs: 500 },
  );

  // Build profile from real order history (mock data)
  const userId = 'cli-user';
  console.log('正在从订单历史构建用户画像...');
  const orders = await orderService.getOrdersByUserId('u001');
  const profile = await buildProfileFromOrders(userId, orders, llmClient);
  await profileStore.save(profile);
  console.log(`画像构建完成（${orders.length} 笔订单，完整度 ${Math.round(profile.getCompleteness() * 100)}%）\n`);

  const agent = new Agent({
    eventBus, profileStore, modelSlotManager,
    intentRouter: new IntentRouter(),
    coldStartManager: new ColdStartManager(),
    productService,
    slidingWindowSize: config.business.slidingWindowSize,
  });

  const messages: Message[] = [];
  const sessionId = `cli-${Date.now()}`;
  eventBus.publish(createEvent('agent:start', { userId }, sessionId));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('=== 电商客服 Agent CLI ===');
  console.log(`画像: ${profile.summarizeForPrompt()}`);
  console.log('输入 /quit 退出, /profile 查看画像, /products 查看可推荐商品\n');

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
        prompt(); return;
      }
      if (trimmed === '/products') {
        const ids = ['p101', 'p102', 'p103', 'p201', 'p202', 'p203', 'p301', 'p302'];
        for (const id of ids) {
          const p = await productService.getProductById(id);
          if (p) console.log(`  ${p.productId}: ${p.productName} (¥${p.price}, ${p.specs.length}个规格)`);
        }
        console.log('\n提示: 在消息中包含商品ID(如 p101)可触发规格推荐\n');
        prompt(); return;
      }

      try {
        const result = await agent.handleMessage(userId, sessionId, trimmed, messages, profile);
        console.log(`\n客服> ${result.reply}`);
        if (result.recommendation) {
          console.log(`  (intent: ${result.intent}, matchMethod: ${result.recommendation.matchMethod})`);
        }
        console.log();
      } catch (err) {
        console.error(`\n[错误] ${err instanceof Error ? err.message : String(err)}\n`);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
