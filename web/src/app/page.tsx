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

const MOCK_PRODUCTS = [
  { id: 'p101', name: 'p101 - 连帽羽绒服 (女装)' },
  { id: 'p102', name: 'p102 - 高腰直筒牛仔裤 (女装)' },
  { id: 'p103', name: 'p103 - 轻便跑步鞋 (女鞋)' },
  { id: 'p201', name: 'p201 - 商务休闲夹克 (男装)' },
  { id: 'p202', name: 'p202 - 直筒休闲裤 (男装)' },
  { id: 'p203', name: 'p203 - 商务正装皮鞋 (男鞋)' },
  { id: 'p301', name: 'p301 - 儿童卡通卫衣 (童装)' },
  { id: 'p302', name: 'p302 - 儿童运动鞋 (童鞋)' },
];

export default function Home() {
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [userId, setUserId] = useState(MOCK_USERS[0].id);
  const [productId, setProductId] = useState(MOCK_PRODUCTS[0].id);
  
  // Use a predictable but unique session ID per user and product selection to keep contexts isolated
  const [sessionId, setSessionId] = useState(() => `web-${MOCK_USERS[0].id}-${MOCK_PRODUCTS[0].id}`);

  const handleUserChange = (newUserId: string) => {
    setUserId(newUserId);
    setSessionId(`web-${newUserId}-${productId}`);
    setDebug(null);
  };

  const handleProductChange = (newProductId: string) => {
    setProductId(newProductId);
    setSessionId(`web-${userId}-${newProductId}`);
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
        
        <div className="p-4 border-b border-gray-700 bg-gray-800/50 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">切换测试用户</label>
            <select 
              value={userId}
              onChange={(e) => handleUserChange(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 text-sm rounded px-2 py-1.5 outline-none focus:border-blue-500"
            >
              {MOCK_USERS.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">当前咨询商品</label>
            <select 
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 text-sm rounded px-2 py-1.5 outline-none focus:border-blue-500"
            >
              {MOCK_PRODUCTS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
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
        <ChatPanel
          key={sessionId} // Force remount when session changes
          apiBase={API_BASE}
          userId={userId}
          sessionId={sessionId}
          productId={productId}
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
