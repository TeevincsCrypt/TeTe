import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';

import { AppFrame } from '@/components/shell/AppFrame';
import { THEME_BOOTSTRAP } from '@/lib/theme';
import { MiniAppProvider } from '@/state/mini-app-provider';

import './globals.css';

/**
 * One variable family covers the whole range: 900 for the display voice, 400-600
 * for body. `next/font` downloads at build time and self-hosts the files, so
 * there is no runtime request to Google and no layout shift — which matters in a
 * WebView on a phone connection.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TeTe — Challenge. Compete. Win.',
  description:
    'Peer-to-peer skill challenges. Stake NIM or USDT, beat your opponent, take the pot. A Nimiq Pay Mini App.',
  applicationName: 'TeTe',
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fbf8f5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before paint so a dark load never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <MiniAppProvider>
          <AppFrame>{children}</AppFrame>
        </MiniAppProvider>
      </body>
    </html>
  );
}
