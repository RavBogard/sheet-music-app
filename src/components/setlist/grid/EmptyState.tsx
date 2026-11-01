'use client'

import { Plus, RefreshCcw, FileText } from 'lucide-react'

import { useT } from '@/i18n/client'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
    /** Primary CTA: clone the user's most-recent prior setlist into this one. */
    onMakeNextWeeks: () => void | Promise<void>
    /** Secondary CTA: focus the bottom add-row placeholder. */
    onAddSong: () => void
    /** Secondary CTA: open the existing template-picker modal. */
    onUseTemplate: () => void
    /** Disable the primary CTA while the clone is in flight. */
    busy?: boolean
}

export function EmptyState({
    onMakeNextWeeks,
    onAddSong,
    onUseTemplate,
    busy = false,
}: EmptyStateProps) {
    const t = useT()
    return (
        <div
            data-testid="setlist-grid-empty-state"
            className="flex flex-col items-center gap-8 px-4 py-16 text-center"
        >
            <div className="space-y-3">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">
                    {t('setlistGrid.emptyStartWithLastWeek')}
                </p>
                <button
                    type="button"
                    onClick={() => void onMakeNextWeeks()}
                    disabled={busy}
                    data-testid="empty-state-clone-cta"
                    className={cn(
                        'inline-flex items-center justify-center gap-2',
                        'min-h-[44px] min-w-[260px] rounded-md px-6 py-3',
                        'bg-primary text-primary-foreground font-medium',
                        'hover:bg-primary/90 active:bg-primary',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                        'disabled:opacity-60 disabled:cursor-not-allowed',
                        'cursor-pointer transition-colors duration-200 motion-reduce:transition-none',
                    )}
                >
                    <RefreshCcw aria-hidden className="h-4 w-4" />
                    <span>{t('setlistGrid.emptyMakeNextWeek')}</span>
                </button>
            </div>

            <div className="flex flex-col items-center gap-3">
                <p className="text-sm uppercase tracking-wider text-muted-foreground">
                    {t('setlistGrid.emptyBuildFromScratch')}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={onAddSong}
                        data-testid="empty-state-add-song-cta"
                        className={cn(
                            'inline-flex items-center justify-center gap-2',
                            'min-h-[44px] rounded-md px-4 py-2',
                            'border border-rule dark:border-rule bg-transparent',
                            'hover:bg-accent/50 active:bg-accent',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                            'cursor-pointer transition-colors duration-200 motion-reduce:transition-none',
                        )}
                    >
                        <Plus aria-hidden className="h-4 w-4" />
                        <span>{t('setlistGrid.emptyAddSong')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onUseTemplate}
                        data-testid="empty-state-template-cta"
                        className={cn(
                            'inline-flex items-center justify-center gap-2',
                            'min-h-[44px] rounded-md px-4 py-2',
                            'border border-rule dark:border-rule bg-transparent',
                            'hover:bg-accent/50 active:bg-accent',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                            'cursor-pointer transition-colors duration-200 motion-reduce:transition-none',
                        )}
                    >
                        <FileText aria-hidden className="h-4 w-4" />
                        <span>{t('setlistGrid.emptyUseTemplate')}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
