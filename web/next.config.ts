import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  // `next build` and `next dev` both write to .next by default, so running a verification build
  // while a dev server is up overwrites the running server's chunks and every request then 500s
  // with "Cannot find module ./N.js" until .next is deleted and dev restarted. Setting
  // NEXT_DIST_DIR lets a build target a scratch directory instead. Default is unchanged.
  //
  // Caveat: a build also rewrites next-env.d.ts and tsconfig.json's `include` to point at whatever
  // distDir it used, so after a scratch build restore next-env.d.ts (`git checkout
  // web/next-env.d.ts`) or just start `next dev`, which regenerates it pointing back at .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
