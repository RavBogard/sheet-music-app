"use client"

import { useEffect, useMemo, useState } from "react"
import { doc, serverTimestamp, updateDoc } from "firebase/firestore"
import { ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { getDb } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorStore } from "@/lib/monitor-store"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/i18n/client"
import { logger } from "@/lib/logger"
import {
    applyCeilingsPatch,
    CEILING_BUS_MAX,
    CEILING_BUS_MIN,
    formatDb,
    normalizeCeilings,
    raisedAboveUnity,
    type CeilingLevels,
    type MonitorCeilings,
} from "@/lib/monitor/limits"

/**
 * BET-4 "Limits" panel (Drew's): the default send and master limit for every
 * wedge, and per-bus overrides, as sliders with a dB readout. Writes
 * `config/monitor.ceilings` directly; Firestore rules let only the crc sound
 * engineer or an admin write it, and require a usable default plus `updatedBy`.
 * The bridge enforces whatever is saved here, for the iPad and the MCP alike.
 */

const STEP = 0.01

function LevelSlider({
    id,
    label,
    value,
    onChange,
}: {
    id: string
    label: string
    value: number
    onChange: (v: number) => void
}) {
    return (
        <div className="flex items-center gap-3 min-h-[44px]">
            <label htmlFor={id} className="w-32 shrink-0 text-sm font-medium">
                {label}
            </label>
            <input
                id={id}
                data-testid={id}
                type="range"
                min={0}
                max={1}
                step={STEP}
                value={value}
                aria-valuetext={formatDb(value)}
                onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) onChange(Math.min(1, Math.max(0, v)))
                }}
                className="flex-1 h-11 cursor-pointer accent-brand"
            />
            <span className="w-16 shrink-0 text-end text-sm font-bold tabular-nums">{formatDb(value)}</span>
        </div>
    )
}

export function LimitsPanel() {
    const t = useT()
    const { user } = useAuth()
    const { isSoundEngineer, isAdmin } = useMonitorAccess()
    const config = useMonitorStore((s) => s.config)
    const raw = (config as { ceilings?: unknown } | null)?.ceilings
    const stored = useMemo(() => normalizeCeilings(raw).ceilings, [raw])
    const buses = useMemo(() => {
        const configured = Array.isArray(config?.monitorBuses) ? config!.monitorBuses.filter((b) => b >= CEILING_BUS_MIN && b <= CEILING_BUS_MAX) : []
        return configured.length ? [...configured].sort((a, b) => a - b) : [1, 2, 3, 4, 5]
    }, [config])

    const [draft, setDraft] = useState<MonitorCeilings>(stored)
    const [saving, setSaving] = useState(false)
    // Follow the stored value until the engineer starts editing.
    const [dirty, setDirty] = useState(false)
    useEffect(() => {
        if (!dirty) setDraft(stored)
    }, [stored, dirty])

    // Lead's ruling: a limit raised above 0 dB risks feedback, so it is saved
    // only after an explicit, inline "Save anyway".
    const raised = dirty ? raisedAboveUnity(raw, draft) : []

    if (!isSoundEngineer && !isAdmin) return null

    const edit = (next: MonitorCeilings) => {
        setDraft(next)
        setDirty(true)
    }
    const setDefault = (kind: "send" | "master", v: number) => edit({ ...draft, default: { ...draft.default, [kind]: v } })
    const busLevels = (b: number): CeilingLevels | undefined => draft.perBus?.[String(b)]
    const setBus = (b: number, levels: CeilingLevels | null) => {
        const perBus = { ...(draft.perBus ?? {}) }
        if (levels) perBus[String(b)] = levels
        else delete perBus[String(b)]
        edit({ ...draft, perBus })
    }

    const save = async () => {
        if (!user) return
        // Replace, not merge: the draft is the whole new value. applyCeilingsPatch
        // validates every number (finite, 0..1) and every bus key.
        const merged = applyCeilingsPatch(
            { default: draft.default },
            { default: draft.default, perBus: draft.perBus ?? {}, perChannel: stored.perChannel ?? {} },
        )
        if (!merged.ok) {
            toast.error(t("monitor.limitsSaveFailed"))
            return
        }
        setSaving(true)
        try {
            const db = await getDb()
            await updateDoc(doc(db, "config", "monitor"), {
                ceilings: { ...merged.ceilings, updatedBy: user.uid, updatedAt: serverTimestamp() },
            })
            setDirty(false)
            toast.success(t("monitor.limitsSaved"))
        } catch (err) {
            logger.warn("[LimitsPanel] save failed", err)
            toast.error(t("monitor.limitsSaveFailed"))
        } finally {
            setSaving(false)
        }
    }

    return (
        <section data-testid="limits-panel" className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck aria-hidden className="w-4 h-4" />
                    {t("monitor.limitsTitle")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">{t("monitor.limitsHint")}</p>
            </div>

            <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("monitor.limitsDefault")}</h4>
                <LevelSlider id="limit-default-send" label={t("monitor.limitSend")} value={draft.default.send} onChange={(v) => setDefault("send", v)} />
                <LevelSlider id="limit-default-master" label={t("monitor.limitMaster")} value={draft.default.master} onChange={(v) => setDefault("master", v)} />
            </div>

            <ul className="divide-y divide-border border-t border-border">
                {buses.map((b) => {
                    const levels = busLevels(b)
                    const own = !!levels
                    return (
                        <li key={b} className="py-2 space-y-1">
                            <div className="flex items-center justify-between min-h-[44px]">
                                <span className="text-sm font-semibold">{t("monitor.limitsPerBus", { bus: b })}</span>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer min-h-[44px]">
                                    {t("monitor.limitsOverride")}
                                    <Switch
                                        data-testid={`limit-bus-${b}-override`}
                                        checked={own}
                                        onCheckedChange={(on) =>
                                            setBus(b, on ? { send: draft.default.send, master: draft.default.master } : null)
                                        }
                                    />
                                </label>
                            </div>
                            {own && (
                                <>
                                    <LevelSlider
                                        id={`limit-bus-${b}-send`}
                                        label={t("monitor.limitSend")}
                                        value={levels!.send ?? draft.default.send}
                                        onChange={(v) => setBus(b, { ...levels, send: v })}
                                    />
                                    <LevelSlider
                                        id={`limit-bus-${b}-master`}
                                        label={t("monitor.limitMaster")}
                                        value={levels!.master ?? draft.default.master}
                                        onChange={(v) => setBus(b, { ...levels, master: v })}
                                    />
                                </>
                            )}
                        </li>
                    )
                })}
            </ul>

            {raised.length > 0 && (
                <p data-testid="limits-above-unity" role="alert" className="text-sm font-medium text-caution">
                    {t("monitor.limitsAboveUnity")}
                </p>
            )}
            <div className="flex justify-end">
                <Button onClick={() => void save()} disabled={saving || !dirty} data-testid="limits-save">
                    {raised.length > 0 ? t("monitor.limitsConfirm") : t("monitor.limitsSave")}
                </Button>
            </div>
        </section>
    )
}
