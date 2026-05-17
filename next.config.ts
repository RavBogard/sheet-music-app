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
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleapis.com https://*.firebasestorage.app https://*.googleusercontent.com; connect-src 'self' blob: https://*.googleapis.com https://apis.google.com https://accounts.google.com https://*.googleusercontent.com https://*.firebaseio.com https://*.firebasestorage.app https://firestore.googleapis.com wss://*.firebaseio.com https://generativelanguage.googleapis.com https://*.ingest.sentry.io https://*.sentry.io https://www.hebcal.com; frame-src 'self' https://accounts.google.com https://*.firebaseapp.com; worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob: https://*.firebasestorage.app",
          },
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

