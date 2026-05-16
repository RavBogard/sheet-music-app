"use client"

import Link from "next/link"
import { FileText, Search, Loader2, ListPlus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ContentMatch {
    page: number
    context: string
}

interface ContentSearchResult {
    fileId: string
    fileName: string
    matches: ContentMatch[]
}

import { DriveFile } from "@/types/models"

/**
 * Displays results from searching within song content.
 * Shows which songs contain the search term and where.
 */
export function ContentSearchResults({
    results,
    searching,
    query,
    canAddToSetlist,
    onAddToSetlist,
}: {
    results: ContentSearchResult[]
    searching: boolean
    query: string
    onSelectFile?: (file: DriveFile) => void
    canAddToSetlist?: boolean
    onAddToSetlist?: (fileId: string, fileName: string) => void
}) {
    if (!query || query.length < 2) return null

    if (searching) {
        return (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Searching within songs...
            </div>
        )
    }

    if (results.length === 0) {
        return (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Search className="w-3.5 h-3.5" />
                {/* F-11 (2026-05-16 bugstomp): operators saw "No content matches"
                    rendered above a title-search panel that had 10+ matches —
                    misread as "search failed." This component searches chart-body
                    text (lyrics/chord chart content), distinct from filename
                    matching above; the label now spells that out. */}
                No chart-body text matches &ldquo;{query}&rdquo;
            </div>
        )
    }

    return (
        <div className="border-t border-border">
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                Found in {results.length} song{results.length !== 1 ? 's' : ''}
            </div>
            <div className="divide-y divide-border">
                {results.slice(0, 10).map(result => (
                    <Link
                        key={result.fileId}
                        href={`/perform/${result.fileId}`}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                    >
                        <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                                {result.fileName.replace(/\.[^.]+$/, '')}
                            </div>
                            {result.matches.slice(0, 2).map((match, i) => (
                                <div key={i} className="text-xs text-muted-foreground mt-0.5 truncate">
                                    <HighlightedContext context={match.context} term={query} />
                                    {match.page > 1 && (
                                        <span className="ml-1 text-muted-foreground/60">(p.{match.page})</span>
                                    )}
                                </div>
                            ))}
                        </div>
                        {canAddToSetlist && onAddToSetlist && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="shrink-0 text-xs"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onAddToSetlist(result.fileId, result.fileName)
                                }}
                            >
                                <ListPlus className="h-3.5 w-3.5 mr-1" />
                                Add to Setlist...
                            </Button>
                        )}
                    </Link>
                ))}
            </div>
        </div>
    )
}

function HighlightedContext({ context, term }: { context: string; term: string }) {
    const lower = context.toLowerCase()
    const termLower = term.toLowerCase()
    const idx = lower.indexOf(termLower)

    if (idx === -1) return <span>{context}</span>

    return (
        <span>
            {context.slice(0, idx)}
            <span className="text-brand font-medium">{context.slice(idx, idx + term.length)}</span>
            {context.slice(idx + term.length)}
        </span>
    )
}
