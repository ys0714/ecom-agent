'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationResponse {
  reply: string;
  intent: string;
  recommendation: unknown | null;
  debug?: DebugInfo;
}

export interface DebugInfo {
  profile: unknown;
  preferenceSignal: unknown;
  arbitration: unknown;
  recommendation: unknown;
  intent: string;
  latencyMs: number;
}

interface ChatPanelProps {
  apiBase: string;
  userId: string;
  sessionId: string;
  productId?: string;
  onDebugUpdate?: (debug: DebugInfo) => void;
}

export default function ChatPanel({ apiBase, userId, sessionId, productId, onDebugUpdate }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');

    const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // 隐式注入商品上下文到第一句话，保持 UI 干净的同时让后端感知当前商品
      const payloadMessage = (messages.length === 0 && productId) 
        ? `[当前正在浏览商品: ${productId}] ${text}` 
        : text;

      const res = await fetch(`${apiBase}/api/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId, message: payloadMessage }),
      });
      const data: ConversationResponse = await res.json();

      const assistantMsg: Message = { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.debug && onDebugUpdate) {
        onDebugUpdate(data.debug);
      }
    } catch (err) {
      const errMsg: Message = { role: 'assistant', content: `[错误] ${err instanceof Error ? err.message : '请求失败'}`, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-gray-400 text-center mt-20">
            <p className="text-lg">电商客服 Agent</p>
            <p className="text-sm mt-2">试试: &quot;商品 p101 哪个尺码适合我&quot; 或 &quot;帮我看看 p202&quot;</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-100'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 text-gray-300 rounded-2xl px-4 py-2 text-sm animate-pulse">
              思考中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-700 p-4">
        {productId && (
          <div className="mb-3 flex gap-2">
            <span className="text-xs text-gray-500 py-1">当前关注商品:</span>
            <span className="text-xs bg-blue-900/30 text-blue-400 border border-blue-800/50 px-2 py-1 rounded">
              {productId}
            </span>
            <button
              onClick={() => {
                setInput(`关于商品 ${productId}，我想问：`);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 underline py-1"
            >
              带入商品
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="输入消息..."
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-xl px-6 py-2 text-sm font-medium transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
