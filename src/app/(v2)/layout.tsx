import type { Metadata } from "next"
import { Geist } from "next/font/google"

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: {
    template: "%s | CRC Music · v2 Beta",
    default: "CRC Music · v2 Beta",
  },
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="v2"
      className={`${geist.variable} v2-surface text-foreground font-sans min-h-screen antialiased`}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.50 0.20 275 / 0.18), transparent 60%), radial-gradient(ellipse 60% 40% at 90% 110%, oklch(0.769 0.188 70.08 / 0.12), transparent 60%)",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        {children}
      </div>
    </div>
  )
}
