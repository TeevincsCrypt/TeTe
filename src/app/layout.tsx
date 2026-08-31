import type { Metadata, Viewport } from 'next';

import { MiniAppProvider } from '@/state/mini-app-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'TeTe — Skill challenges on Nimiq Pay',
  description:
    'Challenge a friend, stake NIM or USDT, win on skill. TeTe is a Nimiq Pay Mini App.',
  applicationName: 'TeTe',
  other: {
    // Lets the WebView paint edge to edge behind the status bar on iOS.
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

/**
 * `viewportFit: 'cover'` plus the safe-area padding in `AppShell` is what keeps
 * the layout clear of the notch and the home indicator inside Nimiq Pay.
 * Zooming is left enabled — pinch-to-zoom is an accessibility affordance, and
 * disabling it is not worth the small layout gain.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08090c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MiniAppProvider>{children}</MiniAppProvider>
      </body>
    </html>
  );
}
