import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// Serwist / PWA service worker removed 2026-05-17 (root-cause fix for
// "site loads then refreshes within a few seconds"). The SW interacted
// badly with Firestore's IDB lifecycle, and the recovery handlers in
// firebase.ts that tried to clean up after it formed self-reinforcing
// reload loops. A tombstone `public/sw.js` is shipped for one release so
// browsers with the legacy SW registered will auto-update to a self-
// unregistering worker; after ~30 days the tombstone can be deleted too.

function pdfjsVersion(): string {
  for (const pkg of [
    'react-pdf/node_modules/pdfjs-dist/package.json',
    'pdfjs-dist/package.json',
  ]) {
    try {
      return require(pkg).version as string
    } catch {
      // try the next location
    }
  }
  return ''
}

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ['@google-cloud/vision', 'pdfjs-dist', '@sparticuz/chromium', 'puppeteer-core'],
  // W-01 Task 6: bundle .paul/AGENT-GUIDE.md into the MCP route's
  // serverless function so it can be read at runtime and injected into
  // the MCP server's `instructions` field. Without this, Next.js's file
  // tracer doesn't see the dynamic-path read and Vercel strips the file.
  outputFileTracingIncludes: {
    '/api/mcp': ['./.paul/AGENT-GUIDE.md'],
    // Authored-chart renderer: the bundled DejaVu TTFs are read with fs at
    // runtime, and @sparticuz/chromium unpacks its brotli'd binary from bin/.
    '/api/render/chart': [
      './src/lib/chart-render/fonts/**',
      './node_modules/@sparticuz/chromium/bin/**',
    ],
  },
  // Perf audit P2-1: the Perform warm-up fetches the versioned pdf.js worker
  // once without importing react-pdf (which would evaluate pdf.js), so it
  // needs the version at build time. Same resolution order as
  // scripts/ops/copy-pdf-worker.js: react-pdf's nested pdfjs-dist, else root.
  env: {
    NEXT_PUBLIC_PDFJS_VERSION: pdfjsVersion(),
  },
  images: {
    // Perf audit P2-2/P2-4: AVIF first for the /login logo, and cache the
    // optimizer's output for a day instead of revalidating on every visit.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile pics
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com', // Firebase Storage
      },
      {
        protocol: 'https',
        hostname: '*.firebasestorage.app', // Firebase Storage CDN
      },
    ],
  },
  async headers() {
    return [
      // Perf audit P2-4: static assets that were served `max-age=0,
      // must-revalidate`. The worker file name carries the pdf.js version, so
      // it never changes in place; the logos are not hashed, so a week.
      {
        source: '/:file(pdf\\.worker\\.min\\.[0-9.]+\\.mjs)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // `logo.jpg` (the /login LCP source, re-audit P3 #11) rides the same rule.
        source: '/:file(logo(?:-\\d+)?\\.(?:avif|webp|jpg))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // C5D-003: Content-Security-Policy is emitted per-request from
          // `src/proxy.ts` so each response carries a unique script-src
          // nonce paired with `'strict-dynamic'`. Setting it here too
          // would produce two CSP headers (browsers enforce the
          // intersection) and the static one would override the nonce.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

const combinedConfig = withBundleAnalyzer(nextConfig);

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(combinedConfig, {
      // Sentry org/project — sourced from Vercel marketplace integration env
      // vars (SENTRY_ORG / SENTRY_PROJECT) so they stay in sync if the org or
      // project slug ever changes.  Fall back to the known slugs so local
      // `next build --webpack` works without the marketplace env present.
      org: process.env.SENTRY_ORG || "centralreform",
      project: process.env.SENTRY_PROJECT || "sentry-orange-island",
      // Source-map upload auth.  Token only set in Vercel build env; locally
      // the upload step silently skips, which is the expected dev behavior.
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Upload a wider net of client chunks so stack traces resolve cleanly
      // even when chunks come from outside the standard Next.js build dirs.
      widenClientFileUpload: true,
      silent: true,
      sourcemaps: { disable: false },
      disableLogger: true,
    })
  : combinedConfig;

