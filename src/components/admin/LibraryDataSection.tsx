"use client"

import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { Database } from "lucide-react"
import { LibrarySyncCard } from "./library/LibrarySyncCard"
import { AiEnrichmentCard } from "./library/AiEnrichmentCard"
import { ChordCacheCard } from "./library/ChordCacheCard"
import { OrphanedFilePruner } from "./library/OrphanedFilePruner"

export function LibraryDataSection() {
    return (
        <CollapsibleSection
            icon={<Database className="w-4 h-4 text-teal-500" />}
            title="Library & Data"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LibrarySyncCard />
                <AiEnrichmentCard />
                <div className="sm:col-span-2 space-y-4">
                    <OrphanedFilePruner />
                    <ChordCacheCard />
                </div>
            </div>
        </CollapsibleSection>
    )
}
