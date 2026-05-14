'use client'

import { Loader2, Upload } from 'lucide-react'
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
} from 'react'

import { useAuth } from '@/lib/auth-context'
import {
    getRecordingPlaybackUrl,
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
    const { isBandLeader, isAdmin } = useAuth()
    const canUpload = isBandLeader || isAdmin

    const [open, setOpen] = useState(false)
    const [recordings, setRecordings] = useState<Recording[]>([])
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Subscribe only while the popover is open — avoids a live Firestore
    // listener per row across a large setlist.
    useEffect(() => {
        if (!open) return
        const unsub = subscribeRecordingsForSong(songId, setRecordings)
        return () => unsub()
    }, [open, songId])

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
                err instanceof Error ? err.message : 'Upload failed',
            )
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
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
                <div className="border-b border-white/10 px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">
                        Recordings
                    </p>
                    {songTitle && (
                        <p className="truncate text-xs text-muted-foreground">
                            {songTitle}
                        </p>
                    )}
                </div>

                <div className="max-h-72 overflow-y-auto p-2">
                    {recordings.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-muted-foreground">
                            No recordings yet
                            {canUpload ? ' — upload one below.' : '.'}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {recordings.map((rec) => (
                                <li
                                    key={rec.id}
                                    className="flex flex-col gap-1 rounded-md bg-white/[0.03] p-2"
                                >
                                    <span className="truncate text-sm text-foreground">
                                        {rec.title}
                                    </span>
                                    {rec.notes && (
                                        <span className="truncate text-xs text-muted-foreground">
                                            {rec.notes}
                                        </span>
                                    )}
                                    <audio
                                        controls
                                        preload="none"
                                        src={getRecordingPlaybackUrl(rec)}
                                        className="w-full"
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {canUpload && (
                    <div className="border-t border-white/10 p-2">
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
                            {uploading ? 'Uploading…' : 'Upload recording'}
                        </label>
                        {uploadError && (
                            <p
                                role="alert"
                                className="mt-2 text-xs text-red-300"
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
