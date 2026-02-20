"use client"

import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { TerminalSquare } from "lucide-react"
import { FirebaseMigrationCard } from "./developer/FirebaseMigrationCard"
import { DataIntegrityCard } from "./developer/DataIntegrityCard"
import { useAuth } from "@/lib/auth-context"

export function DeveloperToolsSection() {
    // Hidden section — usually restricted to highest tier admins
    const { profile } = useAuth()

    // Only show to band leaders or higher, or we could just hide it altogether
    // But for now, we leave it in the Admin Panel
    if (profile?.role !== "band_leader" && profile?.role !== "admin") return null

    return (
        <CollapsibleSection
            icon={<TerminalSquare className="w-4 h-4 text-zinc-500" />}
            title="Developer Tools"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FirebaseMigrationCard />
                <DataIntegrityCard />
            </div>
        </CollapsibleSection>
    )
}
