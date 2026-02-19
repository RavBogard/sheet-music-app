import type { NextConfig } from "next";

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,    // New SW activates immediately (don't wait for old tabs to close)
    clientsClaim: true,   // New SW takes over existing clients right away
    // PDF caching handled by IndexedDB (offline-store.ts) — no runtimeCaching needed
  },
});

const nextConfig: NextConfig = {
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
      {
        // Cache PDF/audio file proxy responses aggressively
        source: '/api/drive/file/:fileId*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400' },
        ],
      },
      {
        // Cache library file responses (Firebase Storage backed)
        source: '/api/library/file/:id*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400' },
        ],
      },
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
