import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App } from 'antd';
import QueryProvider from '@/components/QueryProvider';
import AuthWrapper from '@/components/AuthWrapper';
import './globals.css';

export const metadata: Metadata = {
  title: 'EcomAdmin — 电商管理后台',
  description: 'NestJS + Next.js 全栈电商管理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <App>
            <QueryProvider>
              <AuthWrapper>{children}</AuthWrapper>
            </QueryProvider>
          </App>
        </AntdRegistry>
      </body>
    </html>
  );
}
