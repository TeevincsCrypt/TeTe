import type { NextConfig } from 'next';

/**
 * TeTe runs inside the Nimiq Pay WebView, which is a plain browser environment.
 * We keep the standard (server-capable) Next.js output rather than a static
 * export so that Phase 2 can add route handlers for challenge state, result
 * verification and dispute records without restructuring the project.
 *
 * Nothing in Phase 1 executes on the server: every provider call is client-only.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Next.js does not need to write agent instruction files into this repo.
  agentRules: false,

  /**
   * `@nimiq/core` is a Rust-to-WASM build. Bundling it into the server output
   * breaks the relative path it uses to locate its own .wasm file, so it is
   * left as a real node_modules import that resolves at runtime instead.
   */
  serverExternalPackages: ['@nimiq/core'],

  /**
   * Testing a Mini App means opening the dev server from a phone on the same
   * Wi-Fi — `http://192.168.x.x:5173`, never `localhost`. Next.js 16 rejects
   * dev asset requests from origins it was not told about, which shows up as
   * 403s on `/_next/static/chunks/*` and a page that renders but never
   * hydrates. Allowing the private IPv4 ranges makes LAN testing work whatever
   * address the dev machine happens to get.
   *
   * Development only: these have no effect on a production build.
   */
  allowedDevOrigins: [
    '127.0.0.1',
    '10.*.*.*',
    '172.16.*.*',
    '172.17.*.*',
    '172.18.*.*',
    '172.19.*.*',
    '172.2*.*.*',
    '172.30.*.*',
    '172.31.*.*',
    '192.168.*.*',
    '*.local',
  ],
};

export default nextConfig;
