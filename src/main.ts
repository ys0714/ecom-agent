import { config } from './infra/config.js';

console.log(`[ecom-agent] starting in ${config.server.nodeEnv} mode`);
console.log(`[ecom-agent] data dir: ${config.paths.dataDir}`);
console.log(`[ecom-agent] LLM: ${config.llm.modelId} @ ${config.llm.baseUrl}`);
