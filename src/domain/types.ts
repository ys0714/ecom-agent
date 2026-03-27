/**
 * Domain layer core type definitions.
 * Zero external dependencies except Zod for schema usage in downstream modules.
 */

// ─── Range & Score Primitives ────────────────────────────────────────────────

/** Numeric interval [min, max] used for body measurements */
export type NumericRange = [number, number];

export interface CategoryScore {
  category: string;
  score: number;         // 0~1
  confidence: number;    // 0~1
  orderCount: number;
  lastOrderAt: string;   // ISO 8601
}

export interface SpecScore {
  value: string;
  score: number;         // 0~1
  confidence: number;    // 0~1
  source: 'order_history' | 'explicit' | 'inferred' | 'conversation';
  updatedAt: string;
}

// ─── User Spec Profile (body measurements) ───────────────────────────────────

export type GenderRole = 'female' | 'male' | 'child';

export interface GenderSpecProfile {
  weight: NumericRange | null;
  height: NumericRange | null;
  waistline: NumericRange | null;
  bust: NumericRange | null;
  footLength: NumericRange | null;
  size: string[] | null;
  bottomSize: string[] | null;
  shoeSize: string[] | null;
}

export interface UserSpecProfile {
  userId: string;
  femaleClothing?: GenderSpecProfile;
  maleClothing?: GenderSpecProfile;
  childClothing?: GenderSpecProfile;
  defaultRole: GenderRole;
  updatedAt: string;
}

// ─── Product Spec Profile ────────────────────────────────────────────────────

export type TargetAudience = 'adult_female' | 'adult_male' | 'child';

export interface ProductSpecProfile {
  propValueId: string;
  productId: string;
  category: string;
  targetAudience: TargetAudience;
  weight: NumericRange | null;
  height: NumericRange | null;
  waistline: NumericRange | null;
  bust: NumericRange | null;
  footLength: NumericRange | null;
  size: string | null;
  bottomSize: string | null;
  shoeSize: string | null;
}

// ─── Profile Meta & Dimensions ───────────────────────────────────────────────

export type ColdStartStage = 'cold' | 'warm' | 'hot';

export interface ProfileMeta {
  totalOrders: number;
  profileCompleteness: number;   // 0~1
  lastOrderAt: string;
  dataFreshness: number;         // 0~1
  coldStartStage: ColdStartStage;
}

/** Generic dimension data — concrete dimensions extend this */
export type DimensionData = Record<string, unknown>;
export type DimensionDelta = Record<string, unknown>;

export interface ProfileDelta {
  dimensionId: string;
  delta: DimensionDelta;
  source: SpecScore['source'];
  timestamp: string;
}

// ─── Model Slot ──────────────────────────────────────────────────────────────

export type ModelType = 'spec_inference' | 'profile_extraction' | 'conversation' | 'intent_classify';

export interface ModelProvider {
  name: string;
  endpoint: string;
  modelId: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export interface ModelConfig {
  batchSize: number;
  enableFallback: boolean;
  fallbackProvider?: ModelProvider;
  cacheTTL: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface HealthStatus {
  healthy: boolean;
  latencyP50: number;
  latencyP99: number;
  errorRate: number;
  lastCheckAt: string;
}

// ─── Spec Recommendation (inference output) ──────────────────────────────────

export interface SpecRecommendation {
  propValueId: string;
  selectedSpecs: Record<string, string>;
  confidence: number;     // 0~1
  matchMethod: 'coverage' | 'model_inference';
  reasoning?: string;
}

// ─── Workflow ────────────────────────────────────────────────────────────────

export type WorkflowType =
  | 'product_consult'
  | 'after_sale'
  | 'logistics'
  | 'complaint'
  | 'general';

export interface IntentResult {
  intent: WorkflowType;
  confidence: number;
  entities: Record<string, string>;
}

// ─── Message & Session ───────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;           // tool name for role=tool
  toolCallId?: string;
  timestamp: string;
}

export interface AgentSession {
  sessionId: string;
  userId: string;
  startedAt: string;
  currentWorkflow: WorkflowType;
  messages: Message[];
}

// ─── Orders & Products (external service DTOs) ──────────────────────────────

export interface Order {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
  status: 'paid' | 'shipped' | 'delivered' | 'returned';
}

export interface OrderItem {
  productId: string;
  productName: string;
  category: string;
  specDescription: string;   // raw spec text from merchant
  price: number;
  quantity: number;
}

export interface ProductInfo {
  productId: string;
  productName: string;
  category: string;
  specs: ProductSpecProfile[];  // all available spec variants
  price: number;
  imageUrl?: string;
}

// ─── Guardrails ──────────────────────────────────────────────────────────────

export interface GuardrailResult {
  passed: boolean;
  blockedBy?: 'input' | 'execution' | 'output';
  reason?: string;
  sanitizedContent?: string;
}

// ─── BadCase & Flywheel ──────────────────────────────────────────────────────

export type BadCaseSignal = 'user_rejection' | 'spec_override' | 'session_timeout' | 'transfer_human';

export type SuccessSignal = 'spec_accepted' | 'spec_not_changed' | 'session_purchase';

export type FailureMode =
  | 'cold_start_insufficient'
  | 'low_coverage_match'
  | 'coverage_no_match'
  | 'model_fallback_quality'
  | 'presentation_issue'
  | 'profile_stale'
  | 'unknown';

export interface SpecMatchTrace {
  attempted: boolean;
  topCandidates: Array<{
    propValueId: string;
    coverage: number;
    featureBreakdown: Record<string, number>;
  }>;
  selectedSpec: string | null;
  fallbackToModel: boolean;
}

export interface BadCaseTrace {
  promptVersion: string;
  profileSnapshot: UserSpecProfile | null;
  profileCompleteness: number;
  coldStartStage: ColdStartStage;
  specMatchResult: SpecMatchTrace;
  intentResult: IntentResult;
  workflow: WorkflowType;
}

export interface BadCase {
  id: string;
  sessionId: string;
  userId: string;
  signal: BadCaseSignal;
  weight: number;
  context: {
    userMessage: string;
    agentResponse: string;
    recommendedSpec?: SpecRecommendation;
  };
  trace: BadCaseTrace;
  failureModes: FailureMode[];
  detectedAt: string;
}

// ─── Plugin Interface ────────────────────────────────────────────────────────

export interface ProfileDimensionPlugin {
  dimensionId: string;
  displayName: string;
  applicableCategories?: string[];
  extractFromOrders(orders: Order[]): DimensionData;
  updateFromConversation(msg: Message, current: DimensionData): DimensionDelta;
  summarize(data: DimensionData): string;
}

// ─── EventBus ────────────────────────────────────────────────────────────────

export type EventPriority = 'critical' | 'normal' | 'low';

export type AgentEventType =
  | 'agent:start' | 'agent:stop'
  | 'message:user' | 'message:assistant'
  | 'turn:trace'
  | 'tool:call' | 'tool:result'
  | 'profile:updated'
  | 'model:inference' | 'model:fallback' | 'model:health_check'
  | 'session:summary'
  | 'badcase:detected' | 'badcase:prompt_optimized'
  | 'guardrail:blocked'
  | 'system:error';

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  sessionId?: string;
  payload: Record<string, unknown>;
}

// ─── Segment Compression (context memory) ─────────────────────────────────

export interface CompressedSegment {
  segmentIndex: number;
  turnRange: [number, number];
  summary: string;
  keyFacts: string[];
  intent: WorkflowType;
}
