'use client';

import { useState, useEffect } from 'react';

interface ProfilePanelProps {
  apiBase: string;
  userId: string;
}

export default function ProfilePanel({ apiBase, userId }: ProfilePanelProps) {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/profile/${userId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, [apiBase, userId]);

  if (error) {
    return <div className="p-4 text-yellow-400 text-xs">画像未找到（{error}）— 发送消息后自动创建</div>;
  }

  if (!profile) {
    return <div className="p-4 text-gray-500 text-xs">加载画像...</div>;
  }

  const meta = profile.meta as Record<string, unknown> | undefined;
  const spec = profile.spec as Record<string, unknown> | undefined;

  return (
    <div className="p-4">
      <h2 className="text-sm font-bold text-gray-300 mb-3">用户画像</h2>

      {meta && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <span className={`text-xs px-2 py-1 rounded ${
            meta.coldStartStage === 'hot' ? 'bg-green-900 text-green-200' :
            meta.coldStartStage === 'warm' ? 'bg-yellow-900 text-yellow-200' :
            'bg-red-900 text-red-200'
          }`}>
            {String(meta.coldStartStage)}
          </span>
          <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
            完整度 {Math.round((meta.profileCompleteness as number) * 100)}%
          </span>
          <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
            {String(meta.totalOrders)} 笔订单
          </span>
        </div>
      )}

      {spec && (
        <pre className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto max-h-60 overflow-y-auto">
          {JSON.stringify(spec, null, 2)}
        </pre>
      )}
    </div>
  );
}
