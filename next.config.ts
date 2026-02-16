import type { NextConfig } from "next";

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Cache PDF files served from our API (most critical for offline performance)
        urlPattern: /\/api\/(?:drive|library)\/file\/.+/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'sheet-music-pdfs',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        // Cache Firebase Storage CDN (direct PDF access)
        urlPattern: /^https:\/\/.*\.firebasestorage\.app\/.+/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'firebase-storage-files',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
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
