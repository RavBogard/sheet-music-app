import type { Metadata } from "next"
import { PlatformShell } from "@/components/platform/PlatformShell"
import { requirePlatformOwner } from "./gate"

export const metadata: Metadata = { title: "Platform", robots: { index: false, follow: false } }

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
    await requirePlatformOwner()
    return <PlatformShell>{children}</PlatformShell>
}
