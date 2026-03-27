'use client';

import { useState, useEffect, useCallback } from 'react';

interface TraceEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface TurnTrace {
  turnIndex: number;
  userMessage: string;
  assistantMessage: string;
  timestamp: string;
  trace: Record<string, unknown> | null;
  events: TraceEvent[];
}

interface TraceData {
  sessionId: string;
  totalTurns: number;
  turns: TurnTrace[];
}

interface TracePanelProps {
  apiBase: string;
  sessionId: string;
  refreshKey: number;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  'message:user':       { label: '用户输入', color: 'text-blue-400' },
  'message:assistant':  { label: 'Agent 回复', color: 'text-green-400' },
  'turn:trace':         { label: '流程追踪', color: 'text-yellow-400' },
  'model:inference':    { label: '模型推理', color: 'text-purple-400' },
  'model:fallback':     { label: '模型降级', color: 'text-orange-400' },
  'profile:updated':    { label: '画像更新', color: 'text-cyan-400' },
  'guardrail:blocked':  { label: '护栏拦截', color: 'text-red-400' },
  'tool:call':          { label: '工具调用', color: 'text-indigo-400' },
  'tool:result':        { label: '工具结果', color: 'text-indigo-300' },
  'session:summary':    { label: '上下文压缩', color: 'text-teal-400' },
  'system:error':       { label: '系统错误', color: 'text-red-500' },
};

function getEventMeta(type: string) {
  return EVENT_LABELS[type] ?? { label: type, color: 'text-gray-400' };
}

function PipelineStep({ label, data, color }: { label: string; data: unknown; color?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (data === null || data === undefined) return null;
  return (
    <div className="border-l-2 border-gray-700 pl-3 py-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`text-xs font-medium ${color ?? 'text-gray-300'} hover:underline flex items-center gap-1`}
      >
        <span className={`inline-block w-3 text-center transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        {label}
      </button>
      {expanded && (
        <pre className="bg-gray-800/80 rounded p-2 mt-1 text-xs text-gray-400 overflow-x-auto max-h-40 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TurnCard({ turn, isLatest }: { turn: TurnTrace; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);
  const trace = turn.trace;

  const userDisplay = turn.userMessage.replace(/\[当前正在浏览商品:.*?\]\s*/, '');
  const time = turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString() : '';
  const latency = trace?.latencyMs as number | undefined;

  return (
    <div className={`rounded-lg border ${isLatest ? 'border-blue-700 bg-gray-800/60' : 'border-gray-700/60 bg-gray-800/30'} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-800/80 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-gray-500 shrink-0">#{turn.turnIndex + 1}</span>
          <span className="text-xs text-gray-300 truncate">{userDisplay || '(空消息)'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {latency != null && (
            <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{latency}ms</span>
          )}
          {trace?.intent != null && (
            <span className="text-[10px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">
              {String(trace.intent)}
            </span>
          )}
          <span className="text-xs text-gray-500">{time}</span>
          <span className={`text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700/50">
          {/* User message */}
          <div className="mt-2 bg-blue-900/20 rounded px-2 py-1.5 text-xs text-blue-200 border border-blue-800/30">
            <span className="text-blue-500 font-medium">用户: </span>{userDisplay}
          </div>

          {/* Pipeline steps from trace */}
          {trace && (
            <div className="space-y-0.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-2 mb-1">系统流水线</p>
              <PipelineStep label="意图路由" data={trace.intent} color="text-blue-400" />
              <PipelineStep label="用户画像" data={trace.profile} color="text-cyan-400" />
              <PipelineStep label="偏好检测信号" data={trace.preferenceSignal} color="text-yellow-400" />
              <PipelineStep label="置信度仲裁" data={trace.arbitration} color="text-orange-400" />
              <PipelineStep label="规格推荐" data={trace.recommendation} color="text-green-400" />
              <PipelineStep label="上下文记忆" data={trace.memory} color="text-teal-400" />
            </div>
          )}

          {/* Raw events timeline */}
          {turn.events.length > 0 && (
            <details className="text-xs mt-2">
              <summary className="text-gray-500 cursor-pointer hover:text-gray-300 text-[10px] uppercase tracking-wider">
                原始事件流 ({turn.events.length} events)
              </summary>
              <div className="mt-1 space-y-0.5">
                {turn.events.map((evt, i) => {
                  const meta = getEventMeta(evt.type);
                  return (
                    <PipelineStep
                      key={i}
                      label={`${meta.label} (${new Date(evt.timestamp).toLocaleTimeString()})`}
                      data={evt.payload}
                      color={meta.color}
                    />
                  );
                })}
              </div>
            </details>
          )}

          {/* Assistant reply */}
          <div className="bg-gray-700/30 rounded px-2 py-1.5 text-xs text-gray-300 border border-gray-600/30 whitespace-pre-wrap max-h-32 overflow-y-auto">
            <span className="text-green-500 font-medium">Agent: </span>{turn.assistantMessage || '(无回复)'}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TracePanel({ apiBase, sessionId, refreshKey }: TracePanelProps) {
  const [traceData, setTraceData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTrace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/conversation/${sessionId}/trace`);
      if (res.ok) {
        const data: TraceData = await res.json();
        setTraceData(data);
      }
    } catch (err) {
      console.error('Failed to fetch trace:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase, sessionId]);

  useEffect(() => {
    fetchTrace();
  }, [fetchTrace, refreshKey]);

  if (!traceData || traceData.totalTurns === 0) {
    return (
      <div className="p-4 text-gray-500 text-sm text-center mt-20">
        <p className="text-base font-medium">会话追踪</p>
        <p className="text-xs mt-2">发送消息后，这里会显示每轮对话的完整系统流程</p>
        <p className="text-xs mt-1 text-gray-600">意图路由 → 画像加载 → 偏好检测 → 仲裁 → 推荐 → 回复</p>
        {loading && <p className="text-xs mt-4 text-blue-400 animate-pulse">加载中...</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-gray-300">会话追踪</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">{traceData.totalTurns} 轮对话</p>
        </div>
        <button
          onClick={fetchTrace}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 px-2 py-1 rounded border border-gray-700 transition-colors disabled:opacity-50"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {traceData.turns.map((turn) => (
          <TurnCard
            key={turn.turnIndex}
            turn={turn}
            isLatest={turn.turnIndex === traceData.totalTurns - 1}
          />
        ))}
      </div>
    </div>
  );
}
