"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useMonitorStore } from "@/lib/monitor-store"
import { useMonitorStaleness } from "@/lib/monitor/use-monitor-staleness"
import { useFaderLimits } from "@/lib/monitor/use-fader-limits"
import { busFaderKey, sendLevelKey } from "@/lib/monitor/target-key"
import { formatDb } from "@/lib/monitor/limits"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { SavedMixControls } from "@/components/monitor/SavedMixControls"
import { ConnectionIndicator, DisconnectedOverlay, isMixerOffline } from "@/components/monitor/ConnectionIndicator"
import type { BusAssignment, BusInfo, ChannelInfo } from "@/types/monitor"

/**
 * BET-4 engineer console (`/monitor/engineer`, sound engineer and admins).
 * All wedge buses side by side: who is on each, its master, its loudest
 * channels; "Ride this bus" opens every fader of one bus. A bridge card says in
 * plain words whether the bridge is running, when it last checked in, what
 * started it, whether the watchdog is installed and how many commands wait.
 *
 * Every move is an ordinary command under the engineer's uid; the bridge lets
 * an engineer drive any bus and still holds each move to the limits.
 */

const TOP_CHANNELS = 3
const ALIVE_MS = 120_000

/** The heartbeat fields this card reads; the BET-4 bridge adds the last two. */
interface BridgeHeartbeat {
    lastSeen?: unknown
    queueDepth?: number
    launchReason?: string
    watchdogInstalled?: boolean
}

function millis(v: unknown): number | null {
    if (v == null) return null
    if (typeof v === "number") return Number.isFinite(v) ? v : null
    if (typeof v === "string") {
        const ms = Date.parse(v)
        return Number.isNaN(ms) ? null : ms
    }
    const o = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number }
    try {
        if (typeof o.toMillis === "function") return o.toMillis()
        if (typeof o.toDate === "function") return o.toDate().getTime()
    } catch {
        return null
    }
    return typeof o.seconds === "number" ? o.seconds * 1000 : null
}

const REASON_KEYS: Record<string, string> = {
    boot: "monitor.reasonBoot",
    watchdog: "monitor.reasonWatchdog",
    update: "monitor.reasonUpdate",
    manual: "monitor.reasonManual",
}

export function BridgeStatusCard({ bridge }: { bridge: BridgeHeartbeat | undefined }) {
    const t = useT()
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 10_000)
        return () => clearInterval(id)
    }, [])
    const seen = millis(bridge?.lastSeen)
    const age = seen == null ? null : Math.max(0, now - seen)
    const alive = age != null && age <= ALIVE_MS
    const reasonKey = bridge?.launchReason ? REASON_KEYS[bridge.launchReason] : undefined
    const lines: Array<{ text: string; warn?: boolean }> = [
        {
            text:
                age == null
                    ? t("monitor.bridgeNeverSeen")
                    : age < 120_000
                      ? t("monitor.lastSeenSeconds", { seconds: Math.round(age / 1000) })
                      : t("monitor.lastSeenMinutes", { minutes: Math.round(age / 60_000) }),
        },
        { text: reasonKey ? t("monitor.launchReason", { reason: t(reasonKey) }) : t("monitor.launchUnknown") },
        {
            text:
                bridge?.watchdogInstalled === true
                    ? t("monitor.watchdogYes")
                    : bridge?.watchdogInstalled === false
                      ? t("monitor.watchdogNo")
                      : t("monitor.watchdogUnknown"),
            warn: bridge?.watchdogInstalled === false,
        },
        {
            text:
                typeof bridge?.queueDepth === "number" && bridge.queueDepth > 0
                    ? t("monitor.queue", { count: bridge.queueDepth })
                    : t("monitor.queueEmpty"),
            warn: typeof bridge?.queueDepth === "number" && bridge.queueDepth > 5,
        },
    ]
    return (
        <section data-testid="bridge-status-card" className="bg-card border border-border rounded-[10px] p-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("monitor.bridgeTitle")}</h2>
                <span
                    data-testid="bridge-alive"
                    data-alive={alive}
                    className={`text-sm font-bold ${alive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                >
                    {alive ? t("monitor.bridgeRunning") : t("monitor.bridgeNotRunning")}
                </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm tabular-nums">
                {lines.map((l, i) => (
                    <li key={i} className={l.warn ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground"}>
                        {l.text}
                    </li>
                ))}
            </ul>
        </section>
    )
}

function assigneesOf(raw: BusAssignment | BusAssignment[] | null | undefined): string[] {
    if (!raw) return []
    return (Array.isArray(raw) ? raw : [raw]).map((a) => a?.userName).filter((n): n is string => !!n)
}

/** The loudest audible sends on a bus, for the card's glance. */
export function topChannels(bus: BusInfo | undefined, channels: ChannelInfo[], n = TOP_CHANNELS) {
    if (!bus || !Array.isArray(bus.sends)) return []
    const nameOf = new Map(channels.map((c) => [c.index, c.name]))
    return bus.sends
        .filter((s) => s.on && s.level > 0)
        .sort((a, b) => b.level - a.level)
        .slice(0, n)
        .map((s) => ({ channelIndex: s.channelIndex, name: nameOf.get(s.channelIndex) || `${s.channelIndex}`, level: s.level }))
}

function BusFaders({
    busIndex,
    bus,
    channels,
    onlyMaster,
}: {
    busIndex: number
    bus: BusInfo
    channels: ChannelInfo[]
    onlyMaster: boolean
}) {
    const t = useT()
    const { client } = useMonitorConnection()
    const snapshotSeq = useMonitorStore((s) => s.snapshotCount)
    const unconfirmed = useMonitorStore((s) => s.unconfirmed) ?? []
    const rejections = useMonitorStore((s) => s.rejections) ?? {}
    const updateBusFader = useMonitorStore((s) => s.updateBusFader)
    const updateSendLevel = useMonitorStore((s) => s.updateSendLevel)
    const updateSendOn = useMonitorStore((s) => s.updateSendOn)
    const { stale } = useMonitorStaleness()
    const limits = useFaderLimits(busIndex)
    const nameOf = new Map(channels.map((c) => [c.index, c.name]))
    const masterKey = busFaderKey(busIndex)
    return (
        <div className="space-y-1">
            <FaderStrip
                label={t("monitor.master")}
                value={bus.fader}
                on={bus.on ?? true}
                isMaster
                stale={stale}
                snapshotSeq={snapshotSeq}
                unconfirmed={unconfirmed.includes(masterKey)}
                rejection={rejections[masterKey] ?? null}
                cap={limits.masterCap}
                homeLevel={limits.masterHome}
                clamp={limits.masterClamp}
                onChange={(v) => {
                    updateBusFader(busIndex, v)
                    client?.setBusMaster(busIndex, v)
                }}
            />
            {!onlyMaster &&
                bus.sends.map((send) => {
                    const key = sendLevelKey(send.channelIndex, busIndex)
                    return (
                        <FaderStrip
                            key={send.channelIndex}
                            label={nameOf.get(send.channelIndex) || `${send.channelIndex}`}
                            value={send.level}
                            on={send.on}
                            stale={stale}
                            snapshotSeq={snapshotSeq}
                            unconfirmed={unconfirmed.includes(key)}
                            rejection={rejections[key] ?? null}
                            cap={limits.sendCap(send.channelIndex)}
                            homeLevel={limits.sendHome(send.channelIndex)}
                            clamp={limits.sendClamp(send.channelIndex)}
                            onChange={(v) => {
                                updateSendLevel(busIndex, send.channelIndex, v)
                                client?.setSendLevel(busIndex, send.channelIndex, v)
                            }}
                            onUnmuteCheck={() => {
                                updateSendOn(busIndex, send.channelIndex, true)
                                client?.setSendOn(busIndex, send.channelIndex, true)
                            }}
                        />
                    )
                })}
        </div>
    )
}

export function EngineerConsole() {
    const t = useT()
    useMonitorConnection()
    const status = useMonitorStore((s) => s.status)
    const error = useMonitorStore((s) => s.error)
    const config = useMonitorStore((s) => s.config)
    const buses = useMonitorStore((s) => s.buses)
    const channels = useMonitorStore((s) => s.channels)
    const [riding, setRiding] = useState<number | null>(null)

    const busIndices = useMemo(() => {
        const configured = Array.isArray(config?.monitorBuses) ? config!.monitorBuses : []
        return configured.length ? [...configured].sort((a, b) => a - b) : [1, 2, 3, 4, 5]
    }, [config])
    const offline = isMixerOffline(status, config?.bridge)
    const ridden = riding == null ? undefined : buses.find((b) => b.index === riding)

    return (
        <div className="mx-auto max-w-7xl p-4 pb-24 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Link
                        href="/monitor"
                        aria-label={t("nav.monitor")}
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                        <ArrowLeft aria-hidden className="w-5 h-5 rtl:rotate-180" />
                    </Link>
                    <h1 className="text-[1.6rem] font-extrabold tracking-[-0.015em]">{t("monitor.engineerTitle")}</h1>
                </div>
                <ConnectionIndicator status={status} bridgeStatus={config?.bridge} error={error} />
            </div>

            <BridgeStatusCard bridge={config?.bridge as BridgeHeartbeat | undefined} />

            {status === "connecting" || status === "disconnected" ? (
                <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
                    <Radio aria-hidden className="w-6 h-6 text-brand animate-pulse motion-reduce:animate-none" />
                </div>
            ) : (
                <DisconnectedOverlay active={offline}>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="engineer-bus-grid">
                        {busIndices.map((b) => {
                            const bus = buses.find((x) => x.index === b)
                            const people = assigneesOf(config?.busAssignments?.[String(b)])
                            const top = topChannels(bus, channels)
                            return (
                                <li
                                    key={b}
                                    data-testid={`engineer-bus-${b}`}
                                    className={`bg-card border rounded-[10px] p-3 flex flex-col gap-2 ${riding === b ? "border-brand" : "border-border"}`}
                                >
                                    <div>
                                        <h2 className="text-base font-bold">
                                            {t("monitor.busTitle", { bus: b })}
                                            {bus?.name ? <span className="ms-2 text-sm font-medium text-muted-foreground">{bus.name}</span> : null}
                                        </h2>
                                        <p className="text-sm text-muted-foreground truncate">
                                            {people.length ? people.join(", ") : t("monitor.nobodyOnBus")}
                                        </p>
                                    </div>
                                    {bus && <BusFaders busIndex={b} bus={bus} channels={channels} onlyMaster />}
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                            {t("monitor.topChannels")}
                                        </h3>
                                        {top.length ? (
                                            <ul className="text-sm tabular-nums">
                                                {top.map((c) => (
                                                    <li key={c.channelIndex} className="flex justify-between gap-2">
                                                        <span className="truncate">{c.name}</span>
                                                        <span className="shrink-0 text-muted-foreground">{formatDb(c.level)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">{t("monitor.nothingAudible")}</p>
                                        )}
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="mt-auto"
                                        disabled={!bus}
                                        aria-pressed={riding === b}
                                        data-testid={`ride-bus-${b}`}
                                        onClick={() => setRiding(riding === b ? null : b)}
                                    >
                                        {riding === b ? t("monitor.rideDone") : t("monitor.ride")}
                                    </Button>
                                </li>
                            )
                        })}
                    </ul>
                </DisconnectedOverlay>
            )}

            {riding != null && ridden && (
                <section data-testid="engineer-ride-panel" className="bg-card border border-border rounded-[10px] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-bold">{t("monitor.busTitle", { bus: riding })}</h2>
                        <div className="flex items-center gap-2">
                            <SavedMixControls busIndex={riding} disabled={offline} />
                            <Button variant="outline" onClick={() => setRiding(null)}>
                                {t("monitor.rideDone")}
                            </Button>
                        </div>
                    </div>
                    <DisconnectedOverlay active={offline}>
                        <BusFaders busIndex={riding} bus={ridden} channels={channels} onlyMaster={false} />
                    </DisconnectedOverlay>
                </section>
            )}
        </div>
    )
}
