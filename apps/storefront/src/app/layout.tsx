import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App } from 'antd';
import QueryProvider from '@/components/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'EcomStore — 电商商城',
  description: 'NestJS + Next.js 全栈电商系统 — 用户端',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <App>
            <QueryProvider>{children}</QueryProvider>
          </App>
        </AntdRegistry>
      </body>
    </html>
  );
}
