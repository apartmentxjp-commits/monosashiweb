import type { Metadata } from 'next';
import { Noto_Serif_JP } from 'next/font/google';
import './globals.css';

const notoSerif = Noto_Serif_JP({
  variable: '--font-noto',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://site-omega-three-21.vercel.app'),
  applicationName: '不動産投資シミュレーションアプリ MONO-SASHI',
  title: 'MONO-SASHI — 未来は、自分で選ぶ。',
  description: 'その物件の未来を、買う前に。人生と不動産の50年を歩くスクロールストーリー。',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'MONO-SASHI',
    title: '物件選びを、もっと安全に。｜MONO-SASHI',
    description:
      '不動産投資の判断を、感覚ではなく数字で。MONO-SASHIは、物件の収益性・リスク・将来性を見える化します。',
    images: [
      {
        url: '/og/mono-sashi-x-og.png',
        width: 1730,
        height: 909,
        alt: '物件選びを、もっと安全に。｜MONO-SASHI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '物件選びを、もっと安全に。｜MONO-SASHI',
    description:
      '不動産投資の判断を、感覚ではなく数字で。MONO-SASHIは、物件の収益性・リスク・将来性を見える化します。',
    images: ['/og/mono-sashi-x-og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={notoSerif.variable}>
        {children}
      </body>
    </html>
  );
}
