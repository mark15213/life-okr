import type { Metadata } from 'next';
import { Inter, UnifrakturMaguntia, Special_Elite, Old_Standard_TT } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const newspaperFont = Old_Standard_TT({ weight: ['400', '700'], subsets: ['latin'], style: ['italic', 'normal'], variable: '--font-newspaper' });
const gothicFont = UnifrakturMaguntia({ weight: '400', subsets: ['latin'], variable: '--font-gothic' });
const typewriterFont = Special_Elite({ weight: '400', subsets: ['latin'], variable: '--font-typewriter' });

export const metadata: Metadata = {
  title: 'Hustle.',
  description: 'Personal tracking dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${newspaperFont.variable} ${gothicFont.variable} ${typewriterFont.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
