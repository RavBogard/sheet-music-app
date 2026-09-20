"use client"

import { useState, useCallback, useEffect } from "react"
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
import { Loader2, Check, Mail, Music, AlertTriangle, Users, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import { SetlistMusician } from "@/types/models"

interface NotifyBandDialogProps {
    isOpen: boolean
    onClose: () => void
    setlistId: string
    setlistName: string
    songCount: number
    musicians?: SetlistMusician[]
    /** Has the band already been told about this setlist once? */
    wasNotifiedBefore?: boolean
    onNotified?: () => void
}

interface NotifyResult {
    success: boolean
    wasNotifiedBefore: boolean
    notified: number
    musicianCount: number
    emailed: number
    emailError?: string
    emailTargets: number
    usageRecorded: number
}

export function NotifyBandDialog({ isOpen, onClose, setlistId, setlistName, songCount, musicians = [], wasNotifiedBefore, onNotified }: NotifyBandDialogProps) {
    const [sending, setSending] = useState(false)
    const [result, setResult] = useState<NotifyResult | null>(null)
    const [emailError, setEmailError] = useState<string | null>(null)
    const [resending, setResending] = useState(false)
    // v11.4-01 (D8 item 2): recipient picker. `selected` is the set of
    // musician indices that will be notified across ALL channels (in-app +
    // push + email) — not just email. Defaults to ALL assigned musicians so
    // the common path is unchanged (AC-5); deselecting a musician removes
    // them from every channel (AC-4).
    const [selected, setSelected] = useState<Set<number>>(
        () => new Set(musicians.map((_, i) => i)),
    )
    const [note, setNote] = useState("")
    const defaultSubject = wasNotifiedBefore
        ? `🔄 ${setlistName} — Setlist Updated`
        : `🎵 ${setlistName} — Setlist`
    const [subject, setSubject] = useState(defaultSubject)

    // Sync subject default + reset selection to all-selected when the dialog
    // opens (useState initializers only run once). Keyed on isOpen only:
    // musicians are stable for the lifetime of an open dialog, and re-running
    // on a musicians identity change would wipe the leader's deselections.
    useEffect(() => {
        if (isOpen) {
            setSubject(defaultSubject)
            setSelected(new Set(musicians.map((_, i) => i)))
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const noMusicians = musicians.length === 0
    const selectedCount = selected.size

    const toggleSelected = useCallback((index: number) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }, [])

    const handleNotify = async () => {
        if (noMusicians || selectedCount === 0) return
        setSending(true)
        try {
            // v11.4-01 (D8 item 2): the selected set IS the recipient set for
            // ALL channels. Post only selected musicians as `musicians`
            // (governs in-app + push) and the same subset as `emailRecipients`
            // (governs email). Deselected musicians are excluded entirely →
            // they receive nothing on any channel.
            const selectedMusicians = musicians.filter((_, i) => selected.has(i))
            const emailRecipients = selectedMusicians
                .map(m => ({ name: m.name, email: m.email, uid: m.uid }))

            const response = await apiFetch('/api/setlist/notify-band', {
                method: 'POST',
                body: JSON.stringify({
                    setlistId,
                    musicians: selectedMusicians,
                    emailRecipients,
                    note: note.trim() || undefined,
                    subject: subject.trim() || undefined,
                }),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to notify the band')
            }

            const data: NotifyResult = await response.json()
            setResult(data)
            setEmailError(data.emailError || null)
            onNotified?.()

            if (data.emailError) {
                toast.warning('Band notified, but email delivery failed', {
                    description: data.emailError,
                    duration: 8000,
                })
            } else {
                toast.success(data.wasNotifiedBefore ? 'Band re-notified' : 'Band notified', {
                    description: `${data.musicianCount} musicians · ${data.emailed}/${data.emailTargets} emailed · ${data.usageRecorded} songs indexed`,
                })
            }
        } catch (err) {
            logger.error('[NotifyBandDialog] Error:', err)
            toast.error('Failed to notify the band', {
                description: err instanceof Error ? err.message : 'Unknown error',
            })
        } finally {
            setSending(false)
        }
    }

    const handleResendEmails = async () => {
        setResending(true)
        try {
            const response = await apiFetch('/api/setlist/resend-email', {
                method: 'POST',
                body: JSON.stringify({ setlistId }),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to resend emails')
            }

            const data = await response.json()
            toast.success('Emails resent!', {
                description: `${data.sent} email${data.sent !== 1 ? 's' : ''} sent successfully`,
            })
            setEmailError(null)
        } catch (err) {
            logger.error('[NotifyBandDialog] Resend error:', err)
            toast.error('Failed to resend emails', {
                description: err instanceof Error ? err.message : 'Unknown error',
            })
        } finally {
            setResending(false)
        }
    }

    const handleClose = () => {
        setResult(null)
        setEmailError(null)
        setResending(false)
        setSelected(new Set(musicians.map((_, i) => i)))
        setNote("")
        setSubject(defaultSubject)
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
                {!result ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>{wasNotifiedBefore ? 'Notify band again' : 'Notify band'}</DialogTitle>
                            <DialogDescription className="text-base pt-2">
                                {wasNotifiedBefore ? (
                                    <>Tell the band again about <span className="font-semibold text-foreground">&ldquo;{setlistName}&rdquo;</span></>
                                ) : (
                                    <>Tell the band about <span className="font-semibold text-foreground">&ldquo;{setlistName}&rdquo;</span></>
                                )}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="flex items-center gap-3 text-sm">
                                <Check className="h-4 w-4 text-green-500 shrink-0" />
                                <span>Every setlist is already visible to the band — this sends the notification.</span>
                            </div>

                            {/* Musician list with email toggles */}
                            {noMusicians ? (
                                <div className="flex items-start gap-3 text-sm p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-amber-700 dark:text-amber-400">No musicians assigned</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Go back and add musicians to this setlist before notifying.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Users className="h-4 w-4 text-blue-500 shrink-0" />
                                        <span className="font-medium">{musicians.length} musician{musicians.length !== 1 ? 's' : ''} assigned</span>
                                        <span className="text-xs ml-auto">
                                            {selectedCount > 0 ? (
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <Mail className="h-3 w-3" /> {selectedCount} will be notified
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-amber-500">
                                                    <AlertTriangle className="h-3 w-3" /> No one selected
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground/70 pl-1">
                                        Tap a musician to include or exclude them. Selected people get the in-app notice, push, and email; deselected people get nothing.
                                    </p>
                                    <div className="space-y-0.5 pl-1">
                                        {musicians.map((m, i) => {
                                            const isSelected = selected.has(i)
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    role="checkbox"
                                                    aria-checked={isSelected}
                                                    aria-label={`Notify ${m.name}`}
                                                    onClick={() => toggleSelected(i)}
                                                    className={`flex items-center gap-2 w-full text-left px-2 py-2.5 min-h-[44px] rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${
                                                        isSelected ? '' : 'opacity-60'
                                                    }`}
                                                >
                                                    <div className={`h-5 w-5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                                                        isSelected
                                                            ? 'bg-primary border-primary'
                                                            : 'border-muted-foreground/40'
                                                    }`}>
                                                        {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                                                    </div>
                                                    <span className={isSelected ? '' : 'text-muted-foreground'}>{m.name}</span>
                                                    {m.instrument && (
                                                        <span className="text-xs text-muted-foreground/60">· {m.instrument}</span>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Email subject */}
                            {!noMusicians && (
                                <div className="space-y-1.5">
                                    <label htmlFor="notify-subject" className="text-xs font-medium text-muted-foreground">
                                        Email subject
                                    </label>
                                    <input
                                        id="notify-subject"
                                        type="text"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                    />
                                </div>
                            )}

                            {/* Custom note */}
                            {!noMusicians && (
                                <div className="space-y-1.5">
                                    <label htmlFor="notify-note" className="text-xs font-medium text-muted-foreground">
                                        Add a note to the email <span className="text-muted-foreground/50">(optional)</span>
                                    </label>
                                    <textarea
                                        id="notify-note"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                                        placeholder="e.g. Please review Lecha Dodi — new arrangement this week"
                                        className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                        rows={4}
                                    />
                                    {note.length > 0 && (
                                        <p className={`text-[10px] text-right ${note.length > 1800 ? 'text-amber-500' : 'text-muted-foreground/40'}`}>
                                            {note.length}/2000
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-3 text-sm">
                                <Music className="h-4 w-4 text-violet-500 shrink-0" />
                                <span>Index {songCount} song{songCount !== 1 ? 's' : ''} in usage history</span>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose} disabled={sending}>
                                Cancel
                            </Button>
                            <Button onClick={handleNotify} disabled={sending || noMusicians || selectedCount === 0}>
                                {sending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Sending...
                                    </>
                                ) : noMusicians ? (
                                    'Assign Musicians First'
                                ) : selectedCount === 0 ? (
                                    'Select at least one'
                                ) : wasNotifiedBefore ? (
                                    'Update & Notify'
                                ) : (
                                    'Notify band'
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Check className="h-5 w-5 text-green-500" />
                                {result.wasNotifiedBefore ? 'Band re-notified' : 'Band notified'}
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

                        <DialogFooter className={emailError ? "flex-col sm:flex-row gap-2" : ""}>
                            {emailError && (
                                <Button
                                    variant="outline"
                                    onClick={handleResendEmails}
                                    disabled={resending}
                                    className="gap-2"
                                >
                                    {resending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Resending...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="h-4 w-4" />
                                            Resend Emails
                                        </>
                                    )}
                                </Button>
                            )}
                            <Button onClick={handleClose}>Done</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
