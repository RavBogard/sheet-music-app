"use client"

import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { TerminalSquare } from "lucide-react"
import { FirebaseMigrationCard } from "./developer/FirebaseMigrationCard"
import { DataIntegrityCard } from "./developer/DataIntegrityCard"
import { useAuth } from "@/lib/auth-context"

export function DeveloperToolsSection() {
    // Hidden section — only visible to band leaders and admins
    const { isBandLeader } = useAuth()

    if (!isBandLeader) return null

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
