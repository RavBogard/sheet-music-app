'use client'

import { FileText } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export interface ChartCellProps
    extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    /** Whether the track has a chart bound (i.e. has a songId). */
    hasChart: boolean
}

/**
 * Chart-binding indicator button. Forwards refs and HTML button props so it
 * composes cleanly as a Radix Popover.Trigger via asChild (ChartBindPopover).
 * Renders interactively even without an onClick — clicks fall through when
 * unwrapped, popover opens when wrapped.
 */
export const ChartCell = forwardRef<HTMLButtonElement, ChartCellProps>(
    function ChartCell({ hasChart, className, ...rest }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                tabIndex={-1}
                aria-label={hasChart ? 'Chart bound' : 'No chart bound'}
                data-testid="chart-cell"
                {...rest}
                className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-sm',
                    'cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                    hasChart ? 'text-indigo-400' : 'text-muted-foreground/40',
                    className,
                )}
            >
                <FileText aria-hidden className="h-4 w-4" />
            </button>
        )
    },
)
