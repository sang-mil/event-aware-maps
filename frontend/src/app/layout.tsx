import type { Metadata, Viewport } from 'next';
import './globals.css';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: '틈길',
  description: '공연이 끝나고 편안하게 집에 가요. 덜 붐비는 역과 시간을 알려드려요.',
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/brand/icon.png`, apple: `${base}/brand/icon.png` },
  appleWebApp: { capable: true, title: '틈길', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F4F5F7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
