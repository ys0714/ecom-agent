import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../src/application/agent.js';
import { UserProfileEntity } from '../../src/domain/entities/user-profile.entity.js';
import { InMemoryEventBus } from '../../src/domain/event-bus.js';
import { IntentRouter } from '../../src/application/workflow/intent-router.js';
import { ColdStartManager } from '../../src/application/services/profile-engine/cold-start-manager.js';
import { ModelSlotManager } from '../../src/application/services/model-slot/model-slot-manager.js';
import type { Message } from '../../src/domain/types.js';
import type { LLMClient, ChatResponse } from '../../src/infra/adapters/llm.js';

describe('Agent Tool Calling - recall_history', () => {
  let eventBus: InMemoryEventBus;
  let intentRouter: IntentRouter;
  let coldStartManager: ColdStartManager;
  let mockLLMClient: LLMClient;
  let modelSlotManager: ModelSlotManager;
  let agent: Agent;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    intentRouter = new IntentRouter();
    coldStartManager = new ColdStartManager();

    // Mock LLM Client
    mockLLMClient = {
      chat: vi.fn(),
    };

    modelSlotManager = new ModelSlotManager(eventBus, () => mockLLMClient);
    modelSlotManager.registerSlot('conversation', 'conversation', 
      { name: 'primary', endpoint: '', modelId: 'test-model', maxTokens: 100, temperature: 0, timeoutMs: 1000 },
      { batchSize: 1, enableFallback: false, cacheTTL: 0, maxRetries: 1, retryDelayMs: 0 }
    );

    // Directly overwrite the slot's infer method to return our custom mock responses
    const slot = modelSlotManager['slots'].get('conversation')!;
    slot.primary.infer = vi.fn();

    agent = new Agent({
      eventBus,
      profileStore: {} as any,
      modelSlotManager,
      intentRouter,
      coldStartManager,
      llmClient: mockLLMClient,
      slidingWindowSize: 5,
    });
  });

  it('should handle recall_history tool call and return secondary inference result', async () => {
    const profile = new UserProfileEntity('user1');
    const sessionId = 'session1';
    
    // Setup initial history
    const conversationHistory: Message[] = [
      { role: 'user', content: 'hello earlier', timestamp: '' },
      { role: 'assistant', content: 'hi earlier', timestamp: '' },
      { role: 'user', content: 'my weight is 60kg', timestamp: '' },
      { role: 'assistant', content: 'noted, 60kg', timestamp: '' },
    ]; // 0-3

    // Mock the slot inference
    const inferMock = modelSlotManager['slots'].get('conversation')!.primary.infer as any;
    
    // First call returns a tool call
    inferMock.mockResolvedValueOnce({
      content: '',
      toolCalls: [{
        id: 'call_123',
        name: 'recall_history',
        arguments: JSON.stringify({ startTurn: 2, endTurn: 3 }),
      }]
    } as ChatResponse);

    // Second call returns the final text
    inferMock.mockResolvedValueOnce({
      content: 'I have checked the history, your weight is 60kg.',
      toolCalls: undefined,
    } as ChatResponse);

    const result = await agent.handleMessage('user1', sessionId, 'what is my weight?', conversationHistory, profile);

    // Verify final reply
    expect(result.reply).toBe('I have checked the history, your weight is 60kg.');

    // Verify conversationHistory has been updated correctly
    // Initial length was 4.
    // +1 user message "what is my weight?" (index 4)
    // +1 tool call assistant message (index 5) - Wait, no! `agent.ts` only pushes user and final assistant to `conversationHistory`.
    // The `messages` array inside `agent.ts` has the system/tool msgs but they are NOT pushed to `conversationHistory` array, except via the final `assistantMsg` push.
    // Wait, let's verify if `messages` array logic inside `handleMessage` mutates `conversationHistory`.
    // It shouldn't, because `messages` is a new array `[system, ...window]`.
    
    expect(conversationHistory.length).toBe(6); // 4 initial + 1 user + 1 assistant
    expect(conversationHistory[4].role).toBe('user');
    expect(conversationHistory[4].content).toBe('what is my weight?');
    expect(conversationHistory[5].role).toBe('assistant');
    expect(conversationHistory[5].content).toBe('I have checked the history, your weight is 60kg.');

    // Verify that the tool was called with the right prompt
    // The second call to `infer` should have the tool results appended
    expect(inferMock).toHaveBeenCalledTimes(2);
    
    const secondCallArgs = inferMock.mock.calls[1][0]; // messages array passed to infer
    
    // Check if the tool messages are in the second call
    const toolCallMsg = secondCallArgs.find((m: Message) => m.toolCallId === 'call_123' && m.role === 'assistant');
    const toolResultMsg = secondCallArgs.find((m: Message) => m.role === 'tool' && m.toolCallId === 'call_123');

    expect(toolCallMsg).toBeDefined();
    expect(toolResultMsg).toBeDefined();
    
    // Check if the tool result contains the extracted history correctly
    expect(toolResultMsg.content).toContain('my weight is 60kg');
    expect(toolResultMsg.content).toContain('noted, 60kg');
  });
});