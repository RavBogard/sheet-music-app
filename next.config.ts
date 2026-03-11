import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // cacheOnFrontEndNav and aggressiveFrontEndNavCaching REMOVED.
  // They caused the SW to serve stale HTML/JS after Vercel deploys,
  // preventing critical fixes from reaching users.
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: false,
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
      {
        // Google Auth & profile — SW must NOT intercept these.
        // Workbox's default cross-origin rules try to cache/fetch them,
        // which triggers CSP connect-src violations and breaks sign-in.
        urlPattern: /^https:\/\/(apis\.google\.com|accounts\.google\.com|lh3\.googleusercontent\.com|.*\.firebaseapp\.com)/,
        handler: 'NetworkOnly',
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
          // Allow signInWithPopup to detect popup closure without COOP errors.
          // 'same-origin-allow-popups' permits cross-origin popups (Google sign-in)
          // while still providing same-origin isolation for the main window.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            // CSP Audit (v1.6 Phase 1) — each domain documented:
            // script-src: apis.google.com = Google Identity Services (sign-in)
            // style-src: fonts.googleapis.com = Google Fonts CSS
            // font-src: fonts.gstatic.com = Google Fonts files
            // img-src: *.googleapis.com = Firebase Storage thumbnails; *.firebasestorage.app = Firebase Storage CDN; *.googleusercontent.com = Google profile pics
            // connect-src: *.googleapis.com = Firestore, Firebase Storage, Cloud Vision; apis.google.com = Google Identity Services; accounts.google.com = Google sign-in token exchange; *.googleusercontent.com = profile pics; *.firebaseio.com = Realtime DB; *.firebasestorage.app = Storage CDN; firestore.googleapis.com = Firestore REST; wss://*.firebaseio.com = Realtime DB websocket; generativelanguage.googleapis.com = Gemini AI; *.ingest.sentry.io + *.sentry.io = error reporting
            // frame-src: accounts.google.com = Google sign-in popup; *.firebaseapp.com = Firebase auth
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleapis.com https://*.firebasestorage.app https://*.googleusercontent.com; connect-src 'self' https://*.googleapis.com https://apis.google.com https://accounts.google.com https://*.googleusercontent.com https://*.firebaseio.com https://*.firebasestorage.app https://firestore.googleapis.com wss://*.firebaseio.com https://generativelanguage.googleapis.com https://*.ingest.sentry.io https://*.sentry.io; frame-src 'self' https://accounts.google.com https://*.firebaseapp.com; worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob: https://*.firebasestorage.app",
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

const combinedConfig = withBundleAnalyzer(withPWA(nextConfig));

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(combinedConfig, {
      silent: true,
      sourcemaps: { disable: false },
      disableLogger: true,
    })
  : combinedConfig;
