'use client'

import { AudioLines } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export interface RecordingCellProps
    extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    /** Whether the song has any recordings. Optional — usually unknown until
     *  the popover is opened (no per-row Firestore subscription, by design). */
    hasRecordings?: boolean
    /** True when the row has no song bound — recordings attach to a song. */
    disabled: boolean
}

/**
 * Recording affordance for a setlist row card. A forwardRef button so it
 * composes as the Radix Popover.Trigger for RecordingBindPopover via asChild.
 * Distinct icon (AudioLines) from the chart indicator's Music/FileText.
 */
export const RecordingCell = forwardRef<HTMLButtonElement, RecordingCellProps>(
    function RecordingCell({ hasRecordings, disabled, className, ...rest }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                disabled={disabled}
                aria-label={
                    disabled
                        ? 'No song bound — recordings unavailable'
                        : hasRecordings
                          ? 'Recordings — view and play'
                          : 'Recordings'
                }
                data-testid="recording-cell"
                {...rest}
                className={cn(
                    'flex-none inline-flex items-center justify-center rounded-md',
                    // 40px baseline hit area, 44px on touch.
                    'h-10 w-10',
                    '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    disabled
                        ? 'cursor-not-allowed text-muted-foreground/20'
                        : hasRecordings
                          ? 'cursor-pointer text-brand opacity-80 hover:opacity-100 transition-opacity motion-reduce:transition-none'
                          : 'cursor-pointer text-muted-foreground/50 hover:text-muted-foreground transition-colors motion-reduce:transition-none',
                    className,
                )}
            >
                <AudioLines aria-hidden className="h-5 w-5" />
            </button>
        )
    },
)
