"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Check, Mail, Music, AlertTriangle, Users } from "lucide-react"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import { SetlistMusician } from "@/types/models"

interface PublishDialogProps {
    isOpen: boolean
    onClose: () => void
    setlistId: string
    setlistName: string
    songCount: number
    musicians?: SetlistMusician[]
    onPublished?: () => void
}

interface PublishResult {
    success: boolean
    wasAlreadyPublic: boolean
    notified: number
    musicianCount: number
    emailed: number
    emailError?: string
    emailTargets: number
    usageRecorded: number
}

export function PublishDialog({ isOpen, onClose, setlistId, setlistName, songCount, musicians = [], onPublished }: PublishDialogProps) {
    const [publishing, setPublishing] = useState(false)
    const [result, setResult] = useState<PublishResult | null>(null)

    const noMusicians = musicians.length === 0

    const handlePublish = async () => {
        if (noMusicians) return
        setPublishing(true)
        try {
            const response = await apiFetch('/api/setlist/publish', {
                method: 'POST',
                body: JSON.stringify({ setlistId, musicians }),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to publish')
            }

            const data: PublishResult = await response.json()
            setResult(data)
            onPublished?.()

            toast.success(data.wasAlreadyPublic ? 'Re-notified!' : 'Published!', {
                description: `${data.musicianCount} musicians · ${data.emailed}/${data.emailTargets} emailed · ${data.usageRecorded} songs indexed`
                    + (data.emailError ? ` ⚠️ ${data.emailError}` : ''),
            })
        } catch (err) {
            logger.error('[PublishDialog] Error:', err)
            toast.error('Failed to publish', {
                description: err instanceof Error ? err.message : 'Unknown error',
            })
        } finally {
            setPublishing(false)
        }
    }

    const handleClose = () => {
        setResult(null)
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                {!result ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Publish &amp; Notify</DialogTitle>
                            <DialogDescription className="text-base pt-2">
                                Publish <span className="font-semibold text-foreground">&ldquo;{setlistName}&rdquo;</span>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 py-4">
                            <div className="flex items-center gap-3 text-sm">
                                <Check className="h-4 w-4 text-green-500 shrink-0" />
                                <span>Make visible to all members</span>
                            </div>

                            {/* Musician list */}
                            {noMusicians ? (
                                <div className="flex items-start gap-3 text-sm p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-amber-700 dark:text-amber-400">No musicians assigned</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Go back and add musicians to this setlist before publishing.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3 text-sm">
                                    <Users className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                                    <div>
                                        <span>Notify {musicians.length} musician{musicians.length !== 1 ? 's' : ''}:</span>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {musicians.map((m, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted/50 px-2 py-0.5 rounded-full">
                                                    {m.name}
                                                    {m.instrument && <span className="text-muted-foreground/60">· {m.instrument}</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3 text-sm">
                                <Mail className="h-4 w-4 text-green-500 shrink-0" />
                                <span>Email charts &amp; links to assigned musicians</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Music className="h-4 w-4 text-violet-500 shrink-0" />
                                <span>Index {songCount} song{songCount !== 1 ? 's' : ''} in usage history</span>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose} disabled={publishing}>
                                Cancel
                            </Button>
                            <Button onClick={handlePublish} disabled={publishing || noMusicians}>
                                {publishing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Publishing...
                                    </>
                                ) : noMusicians ? (
                                    'Assign Musicians First'
                                ) : (
                                    'Publish & Notify'
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Check className="h-5 w-5 text-green-500" />
                                {result.wasAlreadyPublic ? 'Re-notified!' : 'Published!'}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-3 py-4">
                            <div className="flex items-center gap-3 text-sm">
                                <Users className="h-4 w-4 text-blue-500 shrink-0" />
                                <span>{result.musicianCount} musician{result.musicianCount !== 1 ? 's' : ''} assigned</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Mail className={`h-4 w-4 shrink-0 ${result.emailError ? 'text-amber-500' : 'text-green-500'}`} />
                                <span>
                                    {result.emailed}/{result.emailTargets} email{result.emailTargets !== 1 ? 's' : ''} sent
                                    {result.emailError && (
                                        <span className="block text-xs text-amber-600 mt-0.5">{result.emailError}</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Music className="h-4 w-4 text-violet-500 shrink-0" />
                                <span>{result.usageRecorded} song{result.usageRecorded !== 1 ? 's' : ''} indexed</span>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={handleClose}>Done</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
