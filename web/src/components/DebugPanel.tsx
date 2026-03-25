'use client';

import type { DebugInfo } from './ChatPanel';

interface DebugPanelProps {
  debug: DebugInfo | null;
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  if (!data) return null;
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</h3>
      <pre className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto max-h-48 overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function DebugPanel({ debug }: DebugPanelProps) {
  if (!debug) {
    return (
      <div className="p-4 text-gray-500 text-sm text-center mt-20">
        <p>调试面板</p>
        <p className="text-xs mt-2">发送消息后，这里会显示画像/匹配/仲裁的完整过程</p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto h-full">
      <h2 className="text-sm font-bold text-gray-300 mb-4">调试面板</h2>

      <div className="mb-4 flex gap-2">
        <span className="bg-blue-900 text-blue-200 text-xs px-2 py-1 rounded">
          {debug.intent}
        </span>
        <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
          {debug.latencyMs}ms
        </span>
      </div>

      <JsonBlock label="用户画像" data={debug.profile} />
      <JsonBlock label="偏好检测信号" data={debug.preferenceSignal} />
      <JsonBlock label="仲裁决策" data={debug.arbitration} />
      <JsonBlock label="规格推荐" data={debug.recommendation} />
    </div>
  );
}
