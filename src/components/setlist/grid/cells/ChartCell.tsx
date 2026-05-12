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
                    // Baseline 40px square; bumped to 44px on touch
                    // breakpoints to satisfy ARCHITECTURE §6.7 minimum
                    // touch-target.
                    'flex h-10 w-10 items-center justify-center rounded-sm',
                    '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
                    'cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                    // Unbound state ghost is muted on desktop (hover
                    // affordance via cell row hover), but bumped to a
                    // higher contrast on touch since there's no hover
                    // state to communicate "click me".
                    hasChart
                        ? 'text-indigo-400'
                        : [
                              // Desktop: ghost until hover affordance
                              'text-muted-foreground/40',
                              // Touch: no hover state, so always visible +
                              // dashed ring signals "tap to link a chart"
                              '[@media(pointer:coarse)]:text-muted-foreground',
                              '[@media(pointer:coarse)]:ring-1',
                              '[@media(pointer:coarse)]:ring-dashed',
                              '[@media(pointer:coarse)]:ring-muted-foreground/30',
                          ].join(' '),
                    className,
                )}
            >
                <FileText aria-hidden className="h-4 w-4" />
            </button>
        )
    },
)
