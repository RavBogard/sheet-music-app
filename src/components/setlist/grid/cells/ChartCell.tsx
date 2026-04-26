'use client'

import { FileText } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ChartCellProps {
    /** Whether the track has a chart bound (i.e. has a songId). */
    hasChart: boolean
    /** Read-only in v50-05-01; click-to-bind opens the match modal in v50-05-02. */
    onClick?: () => void
}

export function ChartCell({ hasChart, onClick }: ChartCellProps) {
    return (
        <button
            type="button"
            tabIndex={-1}
            onClick={onClick}
            disabled={!onClick}
            aria-label={hasChart ? 'Chart bound' : 'No chart bound'}
            className={cn(
                'flex h-10 w-10 items-center justify-center rounded-sm',
                'cursor-default disabled:cursor-default',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                hasChart ? 'text-indigo-400' : 'text-muted-foreground/40',
            )}
            data-testid="chart-cell"
        >
            <FileText aria-hidden className="h-4 w-4" />
        </button>
    )
}
