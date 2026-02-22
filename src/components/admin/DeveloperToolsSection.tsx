"use client"


import { TerminalSquare } from "lucide-react"
import { FirebaseMigrationCard } from "./developer/FirebaseMigrationCard"
import { DataIntegrityCard } from "./developer/DataIntegrityCard"
import { useAuth } from "@/lib/auth-context"

export function DeveloperToolsSection() {
    // Hidden section — only visible to band leaders and admins
    const { isBandLeader } = useAuth()

    if (!isBandLeader) return null

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2">
                <TerminalSquare className="w-5 h-5 text-zinc-500" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Developer Tools
                </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FirebaseMigrationCard />
                <DataIntegrityCard />
            </div>
        </section>
    )
}
