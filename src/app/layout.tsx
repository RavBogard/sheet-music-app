import type { Metadata, Viewport } from "next";
import { Poppins, Righteous, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { ClientProviders } from "@/components/client-providers"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "sonner"

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
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
        <div className="bg-noise" />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <ClientProviders>
              {children}
            </ClientProviders>
            <Toaster richColors position="top-center" theme="system" />
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
