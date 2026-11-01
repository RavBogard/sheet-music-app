'use client'

import { Loader2, Upload } from 'lucide-react'
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
} from 'react'

import { useT } from '@/i18n/client'
import { useAuth } from '@/lib/auth-context'
import { useOrg } from '@/lib/org/org-context'
import { RecordingPlayer } from '@/components/recordings/RecordingPlayer'
import { compareTakes, isPlayable } from '@/lib/recordings/featured'
import {
    featureRecording,
    subscribeRecordingsForSong,
    uploadRecording,
} from '@/lib/recordings/recordings-client'
import { cn } from '@/lib/utils'
import type { Recording } from '@/types/models'

import { TouchOrPopover } from './TouchOrPopover'

export interface RecordingBindPopoverProps {
    /** Trigger — wrapped in TouchOrPopover's Popover.Trigger via asChild. */
    children: ReactNode
    /** The song the recordings link to. */
    songId: string
    /** Shown as a subheading in the popover. */
    songTitle?: string
}

/**
 * Per-row recordings popover — lists the reference recordings linked to a
 * song, plays them inline via native <audio>, and (for band-leaders/admins)
 * uploads a new one. Modeled on ChartBindPopover's TouchOrPopover usage.
 *
 * Manages its own open state — there is no context-menu handoff for
 * recordings, so no controlled-open wiring is needed.
 */
export function RecordingBindPopover({
    children,
    songId,
    songTitle,
}: RecordingBindPopoverProps) {
    const t = useT()
    const { isBandLeader, isAdmin } = useAuth()
    const canUpload = isBandLeader || isAdmin
    // v11.7-06-01: scope the recordings subscription to the current tenant.
    const orgId = useOrg()

    const [open, setOpen] = useState(false)
    const [recordings, setRecordings] = useState<Recording[]>([])
    // Tracks whether the first onSnapshot has arrived — without it, the popover
    // flashes a false "No recordings yet" between open and the first callback.
    const [loaded, setLoaded] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [featuring, setFeaturing] = useState<string | null>(null)
    const [featureError, setFeatureError] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Subscribe only while the popover is open — avoids a live Firestore
    // listener per row across a large setlist.
    useEffect(() => {
        if (!open) {
            setLoaded(false)
            return
        }
        setLoaded(false)
        const unsub = subscribeRecordingsForSong(songId, orgId, (recs) => {
            setRecordings(recs)
            setLoaded(true)
        })
        return () => unsub()
    }, [open, songId, orgId])

    const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        setUploadError(null)
        try {
            await uploadRecording({
                file,
                songId,
                title: file.name.replace(/\.[^/.]+$/, ''),
            })
            // The onSnapshot subscription surfaces the new recording — no
            // manual refetch needed.
        } catch (err) {
            setUploadError(
                err instanceof Error ? err.message : t('setlistGrid.uploadFailed'),
            )
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // Held and hidden takes are never listed. The best playable take (the
    // featured one) sits on top; the rest are one tap away.
    const playable = recordings.filter(isPlayable).sort(compareTakes)
    const [featured, ...others] = playable

    const showThisTake = async (id: string) => {
        setFeaturing(id)
        setFeatureError(false)
        try {
            await featureRecording(id)
        } catch {
            setFeatureError(true)
        } finally {
            setFeaturing(null)
        }
    }

    const inputId = `recording-upload-${songId}`

    return (
        <TouchOrPopover
            open={open}
            onOpenChange={setOpen}
            align="start"
            sideOffset={4}
            contentClassName="w-[22rem]"
            contentTestId="recording-bind-popover"
            trigger={children}
        >
            <div className="flex flex-col">
                <div className="border-b border-rule px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">
                        {t('setlistGrid.recordings')}
                    </p>
                    {songTitle && (
                        <p className="truncate text-xs text-muted-foreground">
                            {songTitle}
                        </p>
                    )}
                </div>

                <div className="max-h-72 overflow-y-auto p-2">
                    {!loaded ? (
                        <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                            {t('setlistGrid.loadingRecordings')}
                        </p>
                    ) : !featured ? (
                        <p className="px-2 py-3 text-sm text-muted-foreground">
                            {canUpload
                                ? t('setlistGrid.noRecordingsUpload')
                                : t('setlistGrid.noRecordings')}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div data-testid="featured-take" className="rounded-md bg-muted/50 p-2">
                                <RecordingPlayer recordingId={featured.id} title={featured.title} />
                                {featured.notes && (
                                    <p className="truncate text-xs text-muted-foreground">{featured.notes}</p>
                                )}
                            </div>
                            {others.length > 0 && (
                                <details data-testid="other-takes" className="group">
                                    <summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-foreground">
                                        {t('recordings.otherTakes', { count: others.length })}
                                    </summary>
                                    <ul className="flex flex-col gap-2">
                                        {others.map((rec) => (
                                            <li key={rec.id} className="flex flex-col gap-1 rounded-md bg-muted/50 p-2">
                                                <RecordingPlayer recordingId={rec.id} title={rec.title} />
                                                {canUpload && (
                                                    <button
                                                        type="button"
                                                        disabled={featuring !== null}
                                                        onClick={() => void showThisTake(rec.id)}
                                                        className="touch-hit min-h-11 self-start rounded-md border border-input px-3 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60"
                                                    >
                                                        {t('recordings.showThisTake')}
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {featureError && (
                                <p role="alert" className="px-2 text-xs text-destructive">
                                    {t('recordings.showThisTakeFailed')}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {canUpload && (
                    <div className="border-t border-rule p-2">
                        <input
                            ref={fileInputRef}
                            id={inputId}
                            type="file"
                            accept="audio/*"
                            disabled={uploading}
                            onChange={(e) => void handleFile(e)}
                            className="sr-only"
                        />
                        <label
                            htmlFor={inputId}
                            className={cn(
                                'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm',
                                'border border-brand/30 bg-brand/10 text-brand',
                                'transition-colors motion-reduce:transition-none',
                                uploading
                                    ? 'cursor-wait opacity-60'
                                    : 'cursor-pointer hover:bg-brand/20',
                            )}
                        >
                            {uploading ? (
                                <Loader2
                                    aria-hidden
                                    className="h-4 w-4 animate-spin"
                                />
                            ) : (
                                <Upload aria-hidden className="h-4 w-4" />
                            )}
                            {uploading ? t('setlistGrid.uploading') : t('setlistGrid.uploadRecording')}
                        </label>
                        {uploadError && (
                            <p
                                role="alert"
                                className="mt-2 text-xs text-destructive"
                            >
                                {uploadError}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </TouchOrPopover>
    )
}
