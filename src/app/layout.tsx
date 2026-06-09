import type { Metadata, Viewport } from "next";
import { Poppins, Righteous, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { OrgProvider } from "@/lib/org/org-context"
import { coerceOrgId } from "@/lib/org/registry"
import { getOrgBranding } from "@/lib/org/branding"
import { ClientProviders } from "@/components/client-providers"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "sonner"
import { LiveRegion } from "@/components/ui/live-region"
import { WebVitalsReporter } from "@/components/web-vitals-reporter"

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const righteous = Righteous({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://centralreform.live'),
  title: {
    template: "%s | CRC Music",
    default: "CRC Music | Digital Sheet Library",
  },
  description: "Digital Sheet Music Library for Central Reform Congregation",
  robots: {
    index: false,
    follow: false
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CRC Music",
  },
  openGraph: {
    type: 'website',
    siteName: 'CRC Music',
    title: 'Central Reform Congregation — Music',
    description: 'Digital Sheet Music Library for Central Reform Congregation',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CRC Music',
    description: 'Digital Sheet Music Library for Central Reform Congregation',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f0f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F23" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // C5D-003: read the per-request CSP nonce set by `src/proxy.ts` and
  // forward it to next-themes' inline FOUC-prevention script so it
  // satisfies the `'nonce-XXX' 'strict-dynamic'` script-src directive.
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;
  // v11-03-01: org resolved at the Edge (src/proxy.ts) and forwarded via
  // `x-org-id`. Passing the header value back through resolveOrgIdByDomain
  // makes it total + typed (any missing/unknown value → DEFAULT_ORG_ID "crc"),
  // so `orgId` is always a valid OrgId. `data-org` is the CSS hook for
  // BL branding (v11-03-02); OrgProvider exposes it to client components.
  // x-org-id carries the org id already resolved at the Edge (src/proxy.ts).
  // coerceOrgId validates it (unknown/missing → crc); do NOT pass it through
  // resolveOrgIdByDomain, which expects a host, not an org id.
  const orgId = coerceOrgId(headersList.get("x-org-id"));
  // v11-03-02: Brothers Lazaroff is a dark+photographic band identity → force
  // dark so the `.dark[data-org="brotherslazaroff"]` navy tokens always apply.
  // CRC's forceDark is false → undefined → next-themes system behavior unchanged.
  const { forceDark } = getOrgBranding(orgId);
  return (
    <html lang="en" data-org={orgId} suppressHydrationWarning>
      <head>
        {/* Preconnect to auth domains — eliminates DNS+TLS handshake delay on sign-in */}
        <link rel="preconnect" href="https://accounts.google.com" />
        <link rel="preconnect" href="https://apis.google.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
        <link rel="preconnect" href={`https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}`} />
      </head>
      <body
        className={`${poppins.variable} ${geistMono.variable} ${righteous.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-brand focus:text-brand-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          Skip to main content
        </a>
        <div className="bg-noise" />
        <OrgProvider orgId={orgId}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            forcedTheme={forceDark ? "dark" : undefined}
            nonce={nonce}
          >
            <ErrorBoundary>
              <ClientProviders>
                {children}
              </ClientProviders>
              <Toaster richColors position="top-center" theme="system" />
              <LiveRegion />
              <WebVitalsReporter />
            </ErrorBoundary>
          </ThemeProvider>
        </OrgProvider>
      </body>
    </html>
  );
}
