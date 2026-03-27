import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import os from 'node:os';

loadDotenv();

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  return raw ? parseInt(raw, 10) : fallback;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  return raw ? parseFloat(raw) : fallback;
}

const DATA_DIR = env('ECOM_AGENT_HOME', path.join(os.homedir(), '.ecom-agent'));
const PROJECT_DIR = path.join(process.cwd(), '.ecom-agent');

export const config = {
  llm: {
    baseUrl: env('LLM_BASE_URL', 'http://localhost:8001/v1'),
    apiKey: env('LLM_API_KEY', 'no-key'),
    modelId: env('LLM_MODEL_ID', 'qwen3-8b-rl'),
    timeoutMs: envInt('LLM_TIMEOUT_MS', 10_000),
    fallback: {
      baseUrl: env('LLM_FALLBACK_BASE_URL', 'http://localhost:8002/v1'),
      modelId: env('LLM_FALLBACK_MODEL_ID', 'qwen2.5-72b'),
    },
  },

  redis: {
    url: env('REDIS_URL', 'redis://localhost:6379'),
  },

  paths: {
    dataDir: DATA_DIR,
    projectDir: PROJECT_DIR,
    profiles: path.join(DATA_DIR, 'profiles'),
    sessions: path.join(DATA_DIR, 'sessions'),
    badcases: path.join(DATA_DIR, 'badcases'),
    prompts: path.join(PROJECT_DIR, 'prompts'),
    experiments: path.join(DATA_DIR, 'experiments'),
  },

  vectorStore: {
    url: env('CHROMA_URL', 'http://localhost:8000'),
    collectionName: env('CHROMA_COLLECTION', 'badcases_fewshot'),
  },

  server: {
    port: envInt('PORT', 3000),
    nodeEnv: env('NODE_ENV', 'development'),
  },

  business: {
    slidingWindowSize: envInt('SLIDING_WINDOW_SIZE', 10),
    badcaseBatchSize: envInt('BADCASE_BATCH_SIZE', 50),
    abTrafficRatio: envFloat('AB_TRAFFIC_RATIO', 0.1),
  },
} as const;

export type AppConfig = typeof config;
