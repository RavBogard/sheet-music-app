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
import { Loader2, Check, Bell, Mail, Music } from "lucide-react"
import { toast } from "sonner"
import { logger } from "@/lib/logger"

interface PublishDialogProps {
    isOpen: boolean
    onClose: () => void
    setlistId: string
    setlistName: string
    songCount: number
    onPublished?: () => void
}

interface PublishResult {
    success: boolean
    wasAlreadyPublic: boolean
    notified: number
    emailed: number
    usageRecorded: number
}

export function PublishDialog({ isOpen, onClose, setlistId, setlistName, songCount, onPublished }: PublishDialogProps) {
    const [publishing, setPublishing] = useState(false)
    const [result, setResult] = useState<PublishResult | null>(null)

    const handlePublish = async () => {
        setPublishing(true)
        try {
            const response = await apiFetch('/api/setlist/publish', {
                method: 'POST',
                body: JSON.stringify({ setlistId }),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to publish')
            }

            const data: PublishResult = await response.json()
            setResult(data)
            onPublished?.()

            toast.success(data.wasAlreadyPublic ? 'Re-notified!' : 'Published!', {
                description: `${data.notified} notified · ${data.emailed} emailed · ${data.usageRecorded} songs indexed`,
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
                            <div className="flex items-center gap-3 text-sm">
                                <Bell className="h-4 w-4 text-blue-500 shrink-0" />
                                <span>Send in-app &amp; email notifications</span>
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
                            <Button onClick={handlePublish} disabled={publishing}>
                                {publishing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Publishing...
                                    </>
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
                                <Bell className="h-4 w-4 text-blue-500 shrink-0" />
                                <span>{result.notified} member{result.notified !== 1 ? 's' : ''} notified</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Mail className="h-4 w-4 text-green-500 shrink-0" />
                                <span>{result.emailed} email{result.emailed !== 1 ? 's' : ''} sent</span>
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
