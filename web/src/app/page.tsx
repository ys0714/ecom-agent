'use client';

import { useState } from 'react';
import ChatPanel, { type DebugInfo } from '../components/ChatPanel';
import DebugPanel from '../components/DebugPanel';
import ProfilePanel from '../components/ProfilePanel';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const USER_ID = 'web-user';
const SESSION_ID = `web-${Date.now()}`;

export default function Home() {
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(true);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Left: Profile */}
      <div className="w-64 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold text-blue-400">ecom-agent</h1>
          <p className="text-xs text-gray-500 mt-1">电商客服 Agent</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ProfilePanel apiBase={API_BASE} userId={USER_ID} />
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
      <div className="flex-1 flex flex-col">
        <ChatPanel
          apiBase={API_BASE}
          userId={USER_ID}
          sessionId={SESSION_ID}
          onDebugUpdate={setDebug}
        />
      </div>

      {/* Right: Debug */}
      {showDebug && (
        <div className="w-96 border-l border-gray-700 overflow-hidden">
          <DebugPanel debug={debug} />
        </div>
      )}
    </div>
  );
}
