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

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ['@google-cloud/vision', 'pdfjs-dist'],
  // W-01 Task 6: bundle .paul/AGENT-GUIDE.md into the MCP route's
  // serverless function so it can be read at runtime and injected into
  // the MCP server's `instructions` field. Without this, Next.js's file
  // tracer doesn't see the dynamic-path read and Vercel strips the file.
  outputFileTracingIncludes: {
    '/api/mcp': ['./.paul/AGENT-GUIDE.md'],
  },
  images: {
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
      silent: true,
      sourcemaps: { disable: false },
      disableLogger: true,
    })
  : combinedConfig;

