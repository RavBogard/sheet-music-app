"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import type { WriteResult } from "@/lib/platform/tenants"
import { errorText } from "./api"

/** Native select styled like the app's inputs (kept native: one user, any device). */
export const selectClass =
    "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"

export function PlatformCard({ id, title, description, children, action }: {
    id?: string
    title: string
    description?: ReactNode
    children: ReactNode
    action?: ReactNode
}) {
    return (
        <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="border border-border rounded-lg p-4 md:p-5 space-y-4 scroll-mt-24">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold text-foreground">{title}</h2>
                    {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    )
}

export function ErrorLine({ error }: { error: string | null }) {
    if (!error) return null
    return <p role="alert" className="text-sm text-destructive">{error}</p>
}

function show(v: unknown): string {
    if (v === undefined || v === null || v === "") return "(empty)"
    if (typeof v === "string") return v
    return JSON.stringify(v)
}

export function DiffList({ diff }: { diff: WriteResult<unknown>["diff"] }) {
    return (
        <ul className="space-y-1.5 text-sm">
            {diff.map((d) => (
                <li key={d.path} className="grid gap-0.5 md:grid-cols-[minmax(10rem,auto)_1fr]">
                    <code className="text-xs text-muted-foreground break-all">{d.path}</code>
                    <span className="break-words">
                        <span className="line-through text-muted-foreground">{show(d.before)}</span>
                        <span aria-hidden> → </span>
                        <span className="sr-only"> becomes </span>
                        <span className="font-medium">{show(d.after)}</span>
                    </span>
                </li>
            ))}
        </ul>
    )
}

/** The dry-run result: what would change. Nothing is written until Apply. */
export function DiffPreview({ result, onApply, onCancel, busy, applyLabel = "Apply" }: {
    result: WriteResult<unknown>
    onApply: () => void
    onCancel: () => void
    busy?: boolean
    applyLabel?: string
}) {
    const nothing = !result.changed || result.diff.length === 0
    return (
        <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 space-y-3" data-testid="diff-preview">
            <p className="text-sm font-medium">{nothing ? "Nothing would change." : "Preview. Nothing is saved until you apply."}</p>
            {!nothing && <DiffList diff={result.diff} />}
            <div className="flex gap-2">
                {!nothing && (
                    <Button size="sm" onClick={onApply} disabled={busy}>
                        {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                        {applyLabel}
                    </Button>
                )}
                <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
                    {nothing ? "Close" : "Cancel"}
                </Button>
            </div>
        </div>
    )
}

/**
 * Dry run, then apply. `preview(fn)` calls fn(true) and keeps fn; `apply()`
 * calls the same fn(false). Errors from either step land in `error`.
 */
export function useDryRun<T>(onApplied?: (r: WriteResult<T>) => void) {
    const fnRef = useRef<((dryRun: boolean) => Promise<WriteResult<T>>) | null>(null)
    const [result, setResult] = useState<WriteResult<T> | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const preview = useCallback(async (fn: (dryRun: boolean) => Promise<WriteResult<T>>) => {
        fnRef.current = fn
        setBusy(true)
        setError(null)
        try {
            setResult(await fn(true))
        } catch (e) {
            setResult(null)
            setError(errorText(e))
        } finally {
            setBusy(false)
        }
    }, [])

    const apply = useCallback(async () => {
        const fn = fnRef.current
        if (!fn) return
        setBusy(true)
        setError(null)
        try {
            const r = await fn(false)
            setResult(null)
            fnRef.current = null
            onApplied?.(r)
        } catch (e) {
            setError(errorText(e))
        } finally {
            setBusy(false)
        }
    }, [onApplied])

    const cancel = useCallback(() => {
        setResult(null)
        setError(null)
        fnRef.current = null
    }, [])

    return { result, busy, error, preview, apply, cancel }
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, children }: {
    open: boolean
    onOpenChange: (o: boolean) => void
    title: string
    description: ReactNode
    confirmLabel: string
    onConfirm: () => void
    children?: ReactNode
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                {children}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirm}>
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
    const [done, setDone] = useState(false)
    return (
        <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text)
                    setDone(true)
                    setTimeout(() => setDone(false), 1500)
                } catch {
                    /* clipboard blocked: the text is on screen to select */
                }
            }}
        >
            {done ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {done ? "Copied" : label}
        </Button>
    )
}

export function StatusChip({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                tone === "warn" && "border-caution/30 bg-caution/10 text-caution dark:text-caution",
                tone === "bad" && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
                tone === "neutral" && "border-border bg-muted text-muted-foreground",
            )}
        >
            {children}
        </span>
    )
}

export const FEATURE_LABELS: Record<string, { label: string; hint: string }> = {
    mixer: { label: "Mixer", hint: "Wedge mixes from phones and iPads" },
    driveInbox: { label: "Drive chart inbox", hint: "Charts dropped in a shared Drive folder come into the library" },
    schedulingEmails: { label: "Scheduling emails", hint: "Reminder emails about who plays when" },
    todayFeed: { label: "Today feed", hint: "Today's services on the home page" },
    notifyBand: { label: "Notify band", hint: "Send a setlist to the band" },
    perform: { label: "Perform mode", hint: "Charts full screen on iPads" },
}

export const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    band_leader: "Band leader",
    musician: "Musician",
    member: "Member",
    pending: "Pending",
    denied: "Declined",
}
