import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Pin tracing to this app so standalone output is self-contained (server.js at its root).
  outputFileTracingRoot: path.resolve(__dirname),
  poweredByHeader: false,
};

export default nextConfig;
