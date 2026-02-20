import type { NextConfig } from "next";

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // cacheOnFrontEndNav and aggressiveFrontEndNavCaching REMOVED.
  // They caused the SW to serve stale HTML/JS after Vercel deploys,
  // preventing critical fixes from reaching users.
  workboxOptions: {
    disableDevLogs: true,
    // skipWaiting removed: new service workers wait until user accepts
    // the update, preventing mid-performance page reloads. The
    // UpdatePrompt component shows a non-intrusive toast when a new
    // version is available.
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /\/api\/library\/list(.*)/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'library-api-swr-cache',
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          },
        },
      },
    ],
  },
  extendDefaultRuntimeCaching: true,
});

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  turbopack: {},
  serverExternalPackages: ['@google-cloud/vision', 'pdfjs-dist'],
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
      // NOTE: Cache-Control for /api/drive/file/ and /api/library/file/
      // is set BY THE ROUTE HANDLER itself, not here. The route sets:
      //   Success: public, max-age=86400 (storage) or max-age=3600 (drive)
      //   Error:   no-store
      // Setting it here would override the route's error headers,
      // causing Vercel CDN to cache 502 errors for hours.
      {
        // Security headers for all routes
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
