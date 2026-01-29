import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { ClientProviders } from "@/components/client-providers"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "sonner"
import { CommandPalette } from "@/components/layout/CommandPalette"
import { OnboardingTour } from "@/components/layout/OnboardingTour"



const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRC Music Books",
  description: "Digital Sheet Music Library for Central Reform Congregation",
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="bg-noise" />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <ClientProviders>
              <OnboardingTour />
              <CommandPalette />
              {children}
            </ClientProviders>
            <Toaster richColors position="top-center" theme="dark" />
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
