"use client"

import { ChevronRight, Folder } from "lucide-react"

export interface Breadcrumb {
    id: string | null
    name: string
}

interface LibraryBreadcrumbsProps {
    breadcrumbs: Breadcrumb[]
    onNavigate: (index: number) => void
}

export function LibraryBreadcrumbs({ breadcrumbs, onNavigate }: LibraryBreadcrumbsProps) {
    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 text-sm no-scrollbar">
            {breadcrumbs.map((crumb, i) => (
                <div key={crumb.id || 'root'} className="flex items-center shrink-0">
                    {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/60 mx-1" />}
                    <button
                        onClick={() => onNavigate(i)}
                        className={`flex items-center hover:text-foreground transition-colors ${i === breadcrumbs.length - 1 ? 'text-foreground font-bold' : 'text-muted-foreground'}`}
                    >
                        {crumb.id === null && <Folder className="h-4 w-4 mr-1" />}
                        {crumb.name}
                    </button>
                </div>
            ))}
        </div>
    )
}
