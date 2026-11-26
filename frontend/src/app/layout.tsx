import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_KR } from 'next/font/google';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// 글꼴은 빌드할 때 내려받아 우리 사이트에서 함께 배포해요.
// 방문자 브라우저가 구글 서버에 접속하지 않아요(방문자 IP가 구글로 가지 않아요).
// 한글 글꼴은 파일이 커서 미리 불러오기(preload)는 끄고, 필요한 글자 묶음만 그때그때 받아요.
const plex = IBM_Plex_Sans_KR({
  weight: ['400', '500', '600', '700'],
  preload: false,
  display: 'swap',
  variable: '--font-plex',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

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
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F4F5F7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={plex.variable}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
