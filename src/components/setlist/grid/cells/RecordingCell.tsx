'use client'

import { AudioLines } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { useT } from '@/i18n/client'
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
        const t = useT()
        return (
            <button
                ref={ref}
                type="button"
                disabled={disabled}
                aria-label={
                    disabled
                        ? t('setlistGrid.recordingsUnavailable')
                        : hasRecordings
                          ? t('setlistGrid.recordingsViewAndPlay')
                          : t('setlistGrid.recordings')
                }
                data-testid="recording-cell"
                {...rest}
                className={cn(
                    'flex-none inline-flex items-center justify-center rounded-md',
                    // 44px hit area (WEB-13).
                    'h-11 w-11',
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
