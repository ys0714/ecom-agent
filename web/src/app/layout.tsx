import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ecom-agent Chat',
  description: '电商客服 Agent 对话 & 调试面板',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
