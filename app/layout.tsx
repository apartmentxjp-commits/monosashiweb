import type { Metadata } from 'next';
import { Noto_Serif_JP } from 'next/font/google';
import './globals.css';

const notoSerif = Noto_Serif_JP({
  variable: '--font-noto',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'MONO-SASHI — 未来は、自分で選ぶ。',
  description: 'その物件の未来を、買う前に。人生と不動産の50年を歩くスクロールストーリー。',
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
