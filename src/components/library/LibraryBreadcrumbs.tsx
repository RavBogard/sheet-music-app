"use client"

import { ChevronRight, Folder } from "lucide-react"
import { Button } from "@/components/ui/button"

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
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigate(i)}
                        className={`h-auto px-1 hover:text-foreground hover:bg-transparent ${i === breadcrumbs.length - 1 ? 'text-foreground font-bold' : 'text-muted-foreground'}`}
                    >
                        {crumb.id === null && <Folder className="h-4 w-4 mr-1" />}
                        {crumb.name}
                    </Button>
                </div>
            ))}
        </div>
    )
}
