"use client"


import { Database } from "lucide-react"
import { LibrarySyncCard } from "./library/LibrarySyncCard"
import { AiEnrichmentCard } from "./library/AiEnrichmentCard"
import { ChordCacheCard } from "./library/ChordCacheCard"
import { OrphanedFilePruner } from "./library/OrphanedFilePruner"

export function LibraryDataSection() {
    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-teal-500" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Library & Data
                </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LibrarySyncCard />
                <AiEnrichmentCard />
                <div className="sm:col-span-2 space-y-4">
                    <OrphanedFilePruner />
                    <ChordCacheCard />
                </div>
            </div>
        </section>
    )
}
