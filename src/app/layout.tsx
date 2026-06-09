import type { Metadata, Viewport } from "next";
import { Poppins, Righteous, Geist_Mono, Zilla_Slab } from "next/font/google";
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

// v11.1-05: vintage slab face for Brothers Lazaroff headings (echoes their
// Western-slab wordmark). `preload: false` + the variable applied ONLY on the
// broslaz <body> (see RootLayout) means CRC never downloads or preloads it.
const zillaSlab = Zilla_Slab({
  weight: ["500", "600", "700"],
  variable: "--font-bl-display",
  subsets: ["latin"],
  preload: false,
});

// v11-04-02: per-tenant head metadata. Reads the Edge-resolved `x-org-id`
// header (same seam the layout body uses for <html data-org>/forceDark) and
// pulls every string from getOrgBranding so brotherslazaroff.live no longer
// renders "Central Reform Congregation — Music" / "CRC Music". CRC output is
// byte-identical to the prior static `metadata` const (the branding.ts CRC
// entry mirrors these strings exactly; covered by branding.test.ts).
export async function generateMetadata(): Promise<Metadata> {
  const orgId = coerceOrgId((await headers()).get("x-org-id"));
  const b = getOrgBranding(orgId);
  return {
    metadataBase: new URL(b.baseUrl),
    title: {
      template: b.metaTitleTemplate,
      default: b.metaTitleDefault,
    },
    description: b.metaDescription,
    robots: {
      index: false,
      follow: false
    },
    manifest: b.manifestPath,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: b.shortName,
    },
    openGraph: {
      type: 'website',
      siteName: b.shortName,
      title: b.ogTitle,
      description: b.metaDescription,
    },
    twitter: {
      card: 'summary_large_image',
      title: b.shortName,
      description: b.metaDescription,
    },
  };
}

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
        className={`${poppins.variable} ${geistMono.variable} ${righteous.variable}${orgId === "brotherslazaroff" ? ` ${zillaSlab.variable}` : ""} antialiased`}
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
