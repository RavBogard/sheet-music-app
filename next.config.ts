import type { NextConfig } from "next";

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // cacheOnFrontEndNav and aggressiveFrontEndNavCaching REMOVED.
  // They caused the SW to serve stale HTML/JS after Vercel deploys,
  // preventing critical fixes from reaching users.
  workboxOptions: {
    disableDevLogs: true,
    // skipWaiting explicitly false: new service workers wait until user accepts
    // the update, preventing mid-performance page reloads. The
    // UpdatePrompt component shows a non-intrusive toast when a new
    // version is available.
    skipWaiting: false,
    clientsClaim: true,
    runtimeCaching: [
      {
        // Must bypass Service Worker for PDF/Audio Range Requests (206 Partial Content)
        // Otherwise, Workbox intercepts with no-response or ERR_FAILED
        urlPattern: /\/api\/(drive|library)\/file(.*)/i,
        handler: 'NetworkOnly',
      },
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
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleapis.com https://*.firebasestorage.app https://*.googleusercontent.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebasestorage.app https://firestore.googleapis.com wss://*.firebaseio.com https://generativelanguage.googleapis.com; frame-src 'self' https://accounts.google.com; worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob: https://*.firebasestorage.app",
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

export default withPWA(nextConfig);
