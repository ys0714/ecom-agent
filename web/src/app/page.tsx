'use client';

import { useState } from 'react';
import ChatPanel, { type DebugInfo } from '../components/ChatPanel';
import DebugPanel from '../components/DebugPanel';
import ProfilePanel from '../components/ProfilePanel';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

const MOCK_USERS = [
  { id: 'web-user', name: '测试用户1 (全画像)' },
  { id: 'cli-user', name: '测试用户2 (仅女装)' },
  { id: 'male-user', name: '测试用户3 (仅男装)' },
  { id: 'cold-user', name: '测试用户4 (冷启动/无画像)' },
];

export default function Home() {
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [userId, setUserId] = useState(MOCK_USERS[0].id);
  
  // Use a predictable but unique session ID per user selection to keep contexts isolated
  const [sessionId, setSessionId] = useState(`web-${userId}-${Date.now()}`);

  const handleUserChange = (newUserId: string) => {
    setUserId(newUserId);
    setSessionId(`web-${newUserId}-${Date.now()}`);
    setDebug(null);
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Left: Profile */}
      <div className="w-64 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold text-blue-400">ecom-agent</h1>
          <p className="text-xs text-gray-500 mt-1">电商客服 Agent</p>
        </div>
        
        <div className="p-4 border-b border-gray-700">
          <label className="block text-xs font-medium text-gray-400 mb-2">切换测试用户</label>
          <select 
            value={userId}
            onChange={(e) => handleUserChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 text-sm rounded px-2 py-1 outline-none focus:border-blue-500"
          >
            {MOCK_USERS.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ProfilePanel apiBase={API_BASE} userId={userId} />
        </div>
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            {showDebug ? '隐藏' : '显示'}调试面板
          </button>
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col relative">
        {/* Mock Products Indicator */}
        <div className="absolute top-0 right-0 p-3 flex gap-2 pointer-events-none opacity-50 z-10">
           <div className="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-700">商品池: p101~p103 (女), p201~p203 (男), p301~p302 (童)</div>
        </div>

        <ChatPanel
          key={sessionId} // Force remount when session changes
          apiBase={API_BASE}
          userId={userId}
          sessionId={sessionId}
          onDebugUpdate={setDebug}
        />
      </div>

      {/* Right: Debug */}
      {showDebug && (
        <div className="w-96 border-l border-gray-700 overflow-hidden bg-gray-900">
          <DebugPanel debug={debug} />
        </div>
      )}
    </div>
  );
}
