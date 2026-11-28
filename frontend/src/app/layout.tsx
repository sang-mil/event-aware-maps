import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/ServiceWorker';
// 글꼴: Pretendard (SIL OFL 1.1). 패키지에 든 글꼴 파일을 사이트와 함께 배포해요(외부 서버에 접속하지 않아요).
// 한글을 글자 묶음별로 나눈 파일이라, 화면에 쓰인 글자 묶음만 그때그때 받아요.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: '틈길',
  description: '공연이 끝나고 편안하게 집에 가요. 덜 붐비는 역과 시간을 알려드려요.',
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/brand/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { url: `${base}/brand/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
    apple: `${base}/brand/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: '틈길', statusBarStyle: 'default' },
  // 링크를 카카오톡·문서에 붙였을 때 보이는 미리보기 카드
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://event-aware-maps.pages.dev'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '틈길',
    title: '틈길 · 공연이 끝나고 편안하게 집에 가요',
    description: '올림픽공원·잠실 공연이 끝날 때 어느 역에서 몇 시에 타면 덜 붐빌지 알려드려요.',
    images: [{ url: `${base}/brand/icon-512.png`, width: 512, height: 512, alt: '틈길' }],
  },
  twitter: {
    card: 'summary',
    title: '틈길 · 공연이 끝나고 편안하게 집에 가요',
    description: '올림픽공원·잠실 공연이 끝날 때 어느 역에서 몇 시에 타면 덜 붐빌지 알려드려요.',
    images: [`${base}/brand/icon-512.png`],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F4F5F7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
