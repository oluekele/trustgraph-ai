import path from 'node:path';
import type { NextConfig } from 'next';

// When set (e.g. on Vercel), /api/* is proxied to the gateway so the browser only
// talks to this origin and the SameSite=Lax session cookie stays first-party.
// Pair it with NEXT_PUBLIC_API_URL=/api.
const gatewayUrl = process.env.GATEWAY_URL?.replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Pin tracing to this app so standalone output is self-contained (server.js at its root).
  outputFileTracingRoot: path.resolve(__dirname),
  poweredByHeader: false,
  async rewrites() {
    return gatewayUrl ? [{ source: '/api/:path*', destination: `${gatewayUrl}/api/:path*` }] : [];
  },
};

export default nextConfig;
