"use client"

import { useState } from "react"
import { History, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { getServiceContext } from "@/lib/liturgical-calendar"
import { formatDb } from "@/lib/monitor/limits"
import { MIX_NAME_MAX } from "@/lib/monitor/saved-mixes"
import { useSavedMixes, type RecallPreview, type SavedMixSummary } from "@/hooks/use-saved-mixes"

/**
 * BET-4 "Save this mix" and "Recall a mix", for the musician's own bus (or,
 * on the engineer console, the bus being ridden).
 *
 * Save names the mix after today's service (Friday Night, Shabbat Morning, a
 * holiday) or the date. Recall lists the person's named mixes and the last 3
 * end-of-service snapshots, shows every change it would make, and only sends
 * after the confirm button: a ramped move through the normal command path.
 */

const SERVICE_LABEL_KEYS: Record<string, string> = {
    shabbat_morning: "setlist.serviceTypeShabbatMorning",
    friday_night: "setlist.serviceTypeFridayNight",
}

function useDefaultMixName() {
    const t = useT()
    const fmt = useFormat()
    return () => {
        const now = new Date()
        const ctx = getServiceContext(now)
        const key = SERVICE_LABEL_KEYS[ctx.type]
        const name = ctx.holiday ?? (key ? t(key) : t("monitor.mixNameDate", { date: fmt.date(now, { month: "short", day: "numeric" }) }))
        return { name: name.slice(0, MIX_NAME_MAX), serviceType: ctx.type === "regular" ? null : ctx.type }
    }
}

function levelText(on: boolean, level: number, offText: string) {
    return on ? formatDb(level) : offText
}

interface SavedMixControlsProps {
    busIndex: number
    /** Compact buttons for the Perform popover header. */
    compact?: boolean
    disabled?: boolean
}

export function SavedMixControls({ busIndex, compact = false, disabled = false }: SavedMixControlsProps) {
    const t = useT()
    const fmt = useFormat()
    const mixes = useSavedMixes(busIndex)
    const defaultName = useDefaultMixName()

    const [saveOpen, setSaveOpen] = useState(false)
    const [name, setName] = useState("")
    const [serviceType, setServiceType] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const [recallOpen, setRecallOpen] = useState(false)
    const [picked, setPicked] = useState<SavedMixSummary | null>(null)
    const [preview, setPreview] = useState<RecallPreview | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [sending, setSending] = useState(false)
    // BET-4 fix round: the recall stopped partway (some faders moved).
    const [partial, setPartial] = useState(false)

    const openSave = () => {
        const d = defaultName()
        setName(d.name)
        setServiceType(d.serviceType)
        setSaveOpen(true)
    }

    const doSave = async () => {
        const trimmed = name.trim()
        if (!trimmed) return
        setSaving(true)
        try {
            await mixes.save(trimmed, serviceType)
            toast.success(t("monitor.mixSaved"))
            setSaveOpen(false)
        } catch {
            toast.error(t("monitor.mixSaveFailed"))
        } finally {
            setSaving(false)
        }
    }

    const openRecall = () => {
        setPicked(null)
        setPreview(null)
        setPartial(false)
        setRecallOpen(true)
        void mixes.reload()
    }

    const pick = async (mix: SavedMixSummary) => {
        setPicked(mix)
        setPreview(null)
        setPartial(false)
        setPreviewing(true)
        try {
            setPreview(await mixes.preview(mix.id))
        } catch {
            toast.error(t("monitor.recallFailed"))
            setPicked(null)
        } finally {
            setPreviewing(false)
        }
    }

    const confirm = async () => {
        if (!picked) return
        setSending(true)
        try {
            if ((await mixes.recall(picked.id)) === "partial") {
                // Keep the sheet open: say what happened and offer Retry, which
                // re-plans from where the faders are now.
                setPartial(true)
                return
            }
            setPartial(false)
            toast.success(t("monitor.recallSent"))
            setRecallOpen(false)
        } catch {
            toast.error(t("monitor.recallFailed"))
        } finally {
            setSending(false)
        }
    }

    const mixLabel = (m: SavedMixSummary) => m.name ?? t("monitor.autoName")
    const mixWhen = (m: SavedMixSummary) =>
        m.createdAt ? fmt.date(new Date(m.createdAt), { weekday: "short", month: "short", day: "numeric" }) : ""

    const btn = compact ? "min-h-[44px] px-3 text-xs" : "min-h-[44px]"

    const mixRow = (m: SavedMixSummary) => (
        <li key={m.id}>
            <button
                type="button"
                data-testid={`saved-mix-${m.id}`}
                onClick={() => void pick(m)}
                className={`flex w-full min-h-[44px] items-center justify-between gap-3 px-4 py-3 text-start cursor-pointer transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${picked?.id === m.id ? "bg-muted/60" : ""}`}
            >
                <span className="font-semibold truncate">{mixLabel(m)}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{mixWhen(m)}</span>
            </button>
        </li>
    )

    return (
        <>
            <div className="flex items-center gap-2">
                <Button variant="outline" className={btn} onClick={openSave} disabled={disabled} data-testid="save-mix-button">
                    <Save aria-hidden />
                    {t("monitor.saveMix")}
                </Button>
                <Button variant="outline" className={btn} onClick={openRecall} disabled={disabled} data-testid="recall-mix-button">
                    <History aria-hidden />
                    {t("monitor.recallMix")}
                </Button>
            </div>

            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("monitor.saveMix")}</DialogTitle>
                        <DialogDescription>{t("monitor.saveMixHint")}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="mix-name">{t("monitor.mixNameLabel")}</Label>
                        <Input
                            id="mix-name"
                            value={name}
                            maxLength={MIX_NAME_MAX}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void doSave()
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSaveOpen(false)}>
                            {t("monitor.cancel")}
                        </Button>
                        <Button onClick={() => void doSave()} disabled={saving || !name.trim()} data-testid="save-mix-confirm">
                            {saving ? t("monitor.saving") : t("monitor.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet open={recallOpen} onOpenChange={setRecallOpen}>
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>{t("monitor.recallTitle")}</SheetTitle>
                        <SheetDescription className="sr-only">{t("monitor.recallTitle")}</SheetDescription>
                    </SheetHeader>
                    <div className="px-4 pb-6 space-y-5">
                        {mixes.loading && !mixes.named.length && !mixes.auto.length ? (
                            <p className="text-sm text-muted-foreground">{t("monitor.recallLoading")}</p>
                        ) : mixes.error ? (
                            <p className="text-sm text-destructive">{t("monitor.recallLoadFailed")}</p>
                        ) : !mixes.named.length && !mixes.auto.length ? (
                            <p className="text-sm text-muted-foreground">{t("monitor.recallNone")}</p>
                        ) : (
                            <>
                                {mixes.named.length > 0 && (
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                                            {t("monitor.recallNamed")}
                                        </h3>
                                        <ul className="rounded-[10px] border border-border divide-y divide-border">
                                            {mixes.named.map(mixRow)}
                                        </ul>
                                    </section>
                                )}
                                {mixes.auto.length > 0 && (
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                                            {t("monitor.recallAuto")}
                                        </h3>
                                        <ul className="rounded-[10px] border border-border divide-y divide-border">
                                            {mixes.auto.map(mixRow)}
                                        </ul>
                                    </section>
                                )}
                            </>
                        )}

                        {picked && (
                            <section data-testid="recall-preview" aria-live="polite" className="space-y-3">
                                {previewing || !preview ? (
                                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 aria-hidden className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                                        {t("monitor.recallLoading")}
                                    </p>
                                ) : preview.changes.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t("monitor.recallNothing")}</p>
                                ) : (
                                    <>
                                        <p className="text-sm font-semibold">
                                            {t("monitor.recallChanges", { count: preview.changes.length })}
                                        </p>
                                        <ul className="rounded-[10px] border border-border divide-y divide-border text-sm">
                                            {preview.changes.map((c) => (
                                                <li
                                                    key={`${c.target}-${c.channelIndex ?? "m"}`}
                                                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                                                >
                                                    <span className="truncate font-medium">
                                                        {c.target === "master" ? t("monitor.recallMaster") : c.channelName}
                                                    </span>
                                                    <span className="tabular-nums text-muted-foreground shrink-0">
                                                        {levelText(c.before.on, c.before.level, t("monitor.recallMuted"))}
                                                        {" → "}
                                                        <span className="text-foreground font-semibold">
                                                            {levelText(c.after.on, c.after.level, t("monitor.recallMuted"))}
                                                        </span>
                                                        {c.heldAtLimit && (
                                                            <span className="ms-2 text-amber-600 dark:text-amber-400">
                                                                {t("monitor.recallHeld")}
                                                            </span>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                                {preview && preview.unmatched.length > 0 && (
                                    <p className="text-sm text-amber-700 dark:text-amber-400">
                                        {t("monitor.recallUnmatched", {
                                            names: preview.unmatched.map((u) => u.channelName || `${u.channelIndex}`).join(", "),
                                        })}
                                    </p>
                                )}
                                {partial && (
                                    <p data-testid="recall-partial" role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                        {t("monitor.recallPartial")}
                                    </p>
                                )}
                                <div className="flex justify-end gap-2 pt-1">
                                    <Button variant="outline" onClick={() => setRecallOpen(false)}>
                                        {t("monitor.cancel")}
                                    </Button>
                                    <Button
                                        onClick={() => void confirm()}
                                        disabled={sending || previewing || !preview || preview.changes.length === 0}
                                        data-testid="recall-confirm"
                                    >
                                        {sending
                                            ? t("monitor.recallSending")
                                            : partial
                                              ? t("monitor.recallRetry")
                                              : t("monitor.recallConfirm")}
                                    </Button>
                                </div>
                            </section>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    )
}
