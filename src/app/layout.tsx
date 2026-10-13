import type { Metadata, Viewport } from "next";
import { Poppins, Righteous, Geist_Mono, Zilla_Slab, Rubik, Heebo, Frank_Ruhl_Libre } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { OrgProvider } from "@/lib/org/org-context"
import { coerceOrgId } from "@/lib/org/registry"
import { getOrgBranding } from "@/lib/org/branding"
import { getOrgConfig } from "@/lib/org/get-org-config"
import { codeOrgConfig } from "@/lib/org/config-code"
import type { FontKey } from "@/lib/org/config-schema"
import { ClientProviders } from "@/components/client-providers"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "sonner"
import { LiveRegion } from "@/components/ui/live-region"
import { WebVitalsReporter } from "@/components/web-vitals-reporter"
import { I18nProvider } from "@/i18n/client"
import { baseLanguageOf, type UiLanguage } from "@/i18n/core"
import { LANG_COOKIE } from "@/i18n/language"
import { clientI18nProps, i18nStateFor, translatorFor } from "@/i18n/server"

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

// Multi-tenant phase 7: Hebrew-capable faces for the fixed font menu
// (config-schema FONT_KEYS rubik / heebo / frankRuhlLibre). Like Zilla Slab,
// `preload: false` and the variable applied ONLY on a tenant that uses them:
// an English tenant's page gains no font <link> and never downloads them.
// Heebo is the Hebrew body face (large x-height, plain, reads well on the band
// iPads); Rubik the display face (rounded, the nearest Hebrew cousin of
// Righteous); Frank Ruhl Libre a serif option. Each is declared once per CSS
// variable it can fill, because next/font binds the variable at build time.
const heeboSans = Heebo({ variable: "--font-sans", subsets: ["hebrew", "latin"], preload: false });
const heeboDisplay = Heebo({ variable: "--font-display", subsets: ["hebrew", "latin"], preload: false });
const rubikSans = Rubik({ variable: "--font-sans", subsets: ["hebrew", "latin"], preload: false });
const rubikDisplay = Rubik({ variable: "--font-display", subsets: ["hebrew", "latin"], preload: false });
const frankSans = Frank_Ruhl_Libre({ weight: ["400", "500", "700"], variable: "--font-sans", subsets: ["hebrew", "latin"], preload: false });
const frankDisplay = Frank_Ruhl_Libre({ weight: ["400", "500", "700"], variable: "--font-display", subsets: ["hebrew", "latin"], preload: false });

/**
 * Multi-tenant phase 1/7: the <body> font variables from the tenant's
 * `branding.fontBody` / `branding.fontDisplay`. English tenants: exactly as
 * before (Poppins body, Righteous display, plus Zilla Slab for a `zillaSlab`
 * display font — Brothers Lazaroff). A Hebrew face as display replaces
 * Righteous. When the UI renders Hebrew, a Latin-only choice (Poppins,
 * Righteous) is swapped for Heebo / Rubik so Hebrew never falls back to a
 * system face.
 */
const BODY_FONT_VARIABLE: Partial<Record<FontKey, string>> = {
  poppins: poppins.variable,
  heebo: heeboSans.variable,
  rubik: rubikSans.variable,
  frankRuhlLibre: frankSans.variable,
};
const HEBREW_DISPLAY_VARIABLE: Partial<Record<FontKey, string>> = {
  heebo: heeboDisplay.variable,
  rubik: rubikDisplay.variable,
  frankRuhlLibre: frankDisplay.variable,
};
const HEBREW_CAPABLE: ReadonlySet<FontKey> = new Set<FontKey>(["heebo", "rubik", "frankRuhlLibre"]);

function bodyFontClassName(fontBody?: FontKey, fontDisplay?: FontKey, lang: UiLanguage = "en"): string {
  const hebrewUi = baseLanguageOf(lang) === "he";
  const bodyKey: FontKey | undefined = hebrewUi && !(fontBody && HEBREW_CAPABLE.has(fontBody)) ? "heebo" : fontBody;
  const body = (bodyKey && BODY_FONT_VARIABLE[bodyKey]) || poppins.variable;
  const displayKey: FontKey | undefined =
    hebrewUi && !(fontDisplay && HEBREW_CAPABLE.has(fontDisplay)) ? "rubik" : fontDisplay;
  const hebrewDisplay = displayKey ? HEBREW_DISPLAY_VARIABLE[displayKey] : undefined;
  if (hebrewDisplay) return `${body} ${geistMono.variable} ${hebrewDisplay} antialiased`;
  const extraDisplay = fontDisplay === "zillaSlab" ? ` ${zillaSlab.variable}` : "";
  return `${body} ${geistMono.variable} ${righteous.variable}${extraDisplay} antialiased`;
}

// v11-04-02: per-tenant head metadata. Reads the Edge-resolved `x-org-id`
// header (same seam the layout body uses for <html data-org>/forceDark) and
// pulls every string from getOrgBranding so brotherslazaroff.live no longer
// renders "Central Reform Congregation — Music" / "CRC Music". CRC output is
// byte-identical to the prior static `metadata` const (the branding.ts CRC
// entry mirrors these strings exactly; covered by branding.test.ts).
export async function generateMetadata(): Promise<Metadata> {
  const orgId = coerceOrgId((await headers()).get("x-org-id"));
  await getOrgConfig(orgId);
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
  // Multi-tenant phase 1: resolve (and prime) the tenant config before any
  // descendant reads a tenant value; OrgProvider hands it to the browser.
  const orgConfig = await getOrgConfig(orgId);
  // v11-03-02: Brothers Lazaroff is a dark+photographic band identity → force
  // dark so the `.dark[data-org="brotherslazaroff"]` navy tokens always apply.
  // CRC's forceDark is false → undefined → next-themes system behavior unchanged.
  const { forceDark } = getOrgBranding(orgId);
  // Multi-tenant phase 7: language and direction from the tenant's locale and
  // the user's `ui-lang` cookie (src/i18n/language.ts; an English tenant
  // ignores the cookie). `dir` is emitted only for rtl, so an ltr page's
  // <html> is unchanged.
  const tenantConfig = orgConfig ?? codeOrgConfig(orgId);
  const i18n = i18nStateFor(orgId, tenantConfig, (await cookies()).get(LANG_COOKIE)?.value ?? null);
  const t = translatorFor(i18n);
  const dir = i18n.dir === "rtl" ? "rtl" : undefined;
  return (
    <html lang={i18n.htmlLang} {...(dir ? { dir } : {})} data-org={orgId} suppressHydrationWarning>
      <head>
        {/* Preconnect to auth domains — eliminates DNS+TLS handshake delay on sign-in */}
        <link rel="preconnect" href="https://accounts.google.com" />
        <link rel="preconnect" href="https://apis.google.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
        <link rel="preconnect" href={`https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}`} />
      </head>
      <body
        className={bodyFontClassName(tenantConfig?.branding.fontBody, tenantConfig?.branding.fontDisplay, i18n.lang)}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-brand focus:text-brand-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          {t("common.skipToMain")}
        </a>
        <div className="bg-noise" />
        <OrgProvider orgId={orgId} config={orgConfig}>
          <I18nProvider {...clientI18nProps(i18n)}>
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
          </I18nProvider>
        </OrgProvider>
      </body>
    </html>
  );
}
