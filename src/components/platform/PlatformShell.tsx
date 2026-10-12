"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2 } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const TABS = [
    { href: "/platform", label: "Tenants" },
    { href: "/platform/activity", label: "Activity" },
]

export function PlatformShell({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? "/platform"
    const active = pathname.startsWith("/platform/activity") ? "/platform/activity" : "/platform"
    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-6 pb-24">
            <div className="max-w-5xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-brand" />
                        Platform
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Every tenant on the app. Only you can see this page.</p>
                </div>
                <nav aria-label="Platform" className="flex gap-1 border-b border-border">
                    {TABS.map((t) => (
                        <Link
                            key={t.href}
                            href={t.href}
                            aria-current={active === t.href ? "page" : undefined}
                            className={cn(
                                "px-4 min-h-11 inline-flex items-center text-sm font-medium border-b-2 -mb-px transition-colors",
                                active === t.href ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t.label}
                        </Link>
                    ))}
                </nav>
                {children}
            </div>
        </div>
    )
}
