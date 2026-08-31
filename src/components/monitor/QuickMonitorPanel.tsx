"use client"

import { useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorStore, getVisibleChannels } from "@/lib/monitor-store"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorStaleness } from "@/lib/monitor/use-monitor-staleness"
import { hasAssignedBus } from "@/lib/monitor/bus-index"
import { getMonitorClient } from "@/hooks/use-monitor-connection"
import { VerticalFaderStrip } from "@/components/monitor/VerticalFaderStrip"
import { doc, getDoc } from "firebase/firestore"
import { getDb } from "@/lib/firebase"
import { Loader2, Wifi, WifiOff, Server, ServerOff, Clock, X } from "lucide-react"
import { ScrollFade } from "@/components/ui/scroll-fade"
import { getBridgeStatusMessage, isMixerOffline, isStateSyncing, DisconnectedOverlay } from "@/components/monitor/ConnectionIndicator"
import { busFaderKey, sendLevelKey } from "@/lib/monitor/target-key"

/**
 * Compact monitor mixer panel for the performance toolbar.
 * Shows master fader + starred/default channel sends as vertical faders.
 * Uses singleton connection -- shared with MonitorPage.
 *
 * Live mode popup: vertical faders in horizontal row, no "More Me!" macro,
 * channels filtered via getVisibleChannels (defaults + starred).
 *
 * 2026-05-26 (monitor-popup-fullbottom-redesign coder-5): outer container
 * now stretches to fill the full bottom-third footprint allocated by the
 * caller (`PerformanceToolbar.tsx` `<PopoverContent>` width:100vw +
 * h-[33vh]). Header gets a 44×44 close button + dividing border; fader row
 * gets gap-6 + px-6 py-4 spacing and `flex-1` to fill the remaining
 * vertical band — no longer cramped on iPad portrait at 820×1180.
 */
interface QuickMonitorPanelProps {
    /** Caller (the Popover wrapping this panel) closes when invoked. iPad UX guard against missed outside-click dismiss. */
    onClose?: () => void
}

export function QuickMonitorPanel({ onClose }: QuickMonitorPanelProps = {}) {
    const { user } = useAuth()
    const { hasAccess } = useMonitorAccess()

    // Granular selectors — only re-render when specific data changes
    const status = useMonitorStore(s => s.status)
    const channels = useMonitorStore(s => s.channels)
    const buses = useMonitorStore(s => s.buses)
    const config = useMonitorStore(s => s.config)
    const myBusIndex = useMonitorStore(s => s.myBusIndex)
    // C-2: authoritative-snapshot counter for the fader confirmation machine.
    const snapshotSeq = useMonitorStore(s => s.snapshotCount)
    // R5 / R2: the bridge's "could not read this" list and its per-command
    // verdicts, both keyed by the bridge's own target-key vocabulary.
    // Defaulted at the selector: a partial store (an older persisted shape, or a
    // test fixture) must degrade to "nothing flagged", never throw inside the
    // panel a musician is holding mid-service.
    const unconfirmed = useMonitorStore(s => s.unconfirmed) ?? []
    const rejections = useMonitorStore(s => s.rejections) ?? {}
    const starredChannels = useMonitorStore(s => s.starredChannels)
    const defaultChannels = useMonitorStore(s => s.defaultChannels)
    const setStarredChannels = useMonitorStore(s => s.setStarredChannels)
    const updateBusFader = useMonitorStore(s => s.updateBusFader)
    const updateBusOn = useMonitorStore(s => s.updateBusOn)
    const updateSendLevel = useMonitorStore(s => s.updateSendLevel)
    const updateSendOn = useMonitorStore(s => s.updateSendOn)
    // C-6: honest staleness on this perform-toolbar surface too (not just /monitor).
    const { stale } = useMonitorStaleness()

    // Load starred channels from Firestore (backward compat: pinnedChannels field)
    useEffect(() => {
        if (!user) return
        let cancelled = false
        void (async () => {
            try {
                const db = await getDb()
                const snap = await getDoc(doc(db, "users", user.uid, "preferences", "monitor"))
                if (cancelled) return
                if (snap.exists()) {
                    const data = snap.data()
                    const channels = data.pinnedChannels || []
                    // Only set if store doesn't already have starred channels
                    // (store may have been populated by configure mode)
                    if (channels.length > 0) {
                        setStarredChannels(channels)
                    }
                }
            } catch { /* silent — preferences are optional */ }
        })()
        return () => { cancelled = true }
    }, [user, setStarredChannels])

    // Fader handlers
    const handleBusMaster = useCallback((value: number) => {
        if (myBusIndex == null) return
        updateBusFader(myBusIndex, value)
        getMonitorClient()?.setBusMaster(myBusIndex, value)
    }, [myBusIndex, updateBusFader])

    const handleBusOn = useCallback((on: boolean) => {
        // Master-mute toggle — mirrors handleSendOn shape; routes to
        // `setBusOn` → Firestore `set_bus_on` command → bridge OSC `/bus/MM/mix/on`.
        // Pre-v10.0.7 bridges will reject this with "unknown command" (the fader
        // confirmation machine reverts the optimistic toggle after timeout),
        // which is the acceptable degrade until v10.0.7 ships.
        if (myBusIndex == null) return
        updateBusOn(myBusIndex, on)
        getMonitorClient()?.setBusOn(myBusIndex, on)
    }, [myBusIndex, updateBusOn])

    const handleSendLevel = useCallback((channelIndex: number, value: number) => {
        if (myBusIndex == null) return
        updateSendLevel(myBusIndex, channelIndex, value)
        getMonitorClient()?.setSendLevel(myBusIndex, channelIndex, value)
    }, [myBusIndex, updateSendLevel])

    const handleSendOn = useCallback((channelIndex: number, on: boolean) => {
        if (myBusIndex == null) return
        updateSendOn(myBusIndex, channelIndex, on)
        getMonitorClient()?.setSendOn(myBusIndex, channelIndex, on)
    }, [myBusIndex, updateSendOn])

    // Derived state
    const myBus = buses.find(b => b.index === myBusIndex)
    const channelMap = new Map(channels.map(c => [c.index, c]))

    // Filter channels using getVisibleChannels (defaults + starred, filtered to bus sends)
    const visibleChannelIndices = getVisibleChannels(
        defaultChannels,
        starredChannels,
        myBus?.sends || []
    )
    const visibleSends = myBus?.sends.filter(s =>
        visibleChannelIndices.includes(s.channelIndex)
    ) || []

    // Not ready states
    if (!hasAccess) return null

    // Bridge heartbeat status
    const bridgeMessage = getBridgeStatusMessage(config?.bridge)
    if (bridgeMessage) {
        const isMixerOnly = bridgeMessage.includes("mixer disconnected")
        return (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                {isMixerOnly ? <ServerOff className="w-4 h-4 text-yellow-600" /> : <ServerOff className="w-4 h-4" />}
                <span className="text-xs">{bridgeMessage}</span>
            </div>
        )
    }

    if (status === "connecting") {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Connecting to mixer...</span>
            </div>
        )
    }

    if (status === "error" || status === "disconnected") {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                <WifiOff className="w-4 h-4" />
                <span className="text-xs">Mixer offline</span>
            </div>
        )
    }

    // C-11: bus index 0 is a valid bus — don't treat it as "no bus".
    if (!hasAssignedBus(myBusIndex) || !myBus) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                No monitor bus assigned
            </div>
        )
    }

    const mixerOffline = isMixerOffline(status, config?.bridge)
    // R7: bridge + desk healthy, state pipeline behind. Faders stay interactive;
    // optimistic writes still queue and still reach the desk.
    const syncing = isStateSyncing(config?.bridge)

    return (
        <div className="w-full h-full flex flex-col">
            {/* Header — px-6 py-3 + border divider; close button (44×44 touch target) right-side */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border/40 shrink-0">
                <div>
                    <div className="text-sm font-semibold text-foreground truncate pr-2 max-w-[180px]">
                        {myBus.name && myBus.name !== `Bus ${myBusIndex}` ? myBus.name : "My Monitor"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        Bus {myBusIndex}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* R7: a wedged state pipeline is a QUIET hint, not "No mixer" and
                        certainly not a reason to disable anything — the desk is still
                        taking commands. Only a genuinely unreachable mixer says so. */}
                    {syncing ? (
                        <div className="flex items-center gap-1.5">
                            <Server className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">Syncing…</span>
                        </div>
                    ) : stale ? (
                        // C-6: honest staleness — don't show a green "Live" over a frozen desk.
                        <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-yellow-500" />
                            <span className="text-[10px] text-yellow-500">Stale</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <Wifi className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] text-green-500">Live</span>
                        </div>
                    )}
                    {onClose ? (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close monitor mix"
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Vertical faders in horizontal row — gap-6 + px-6 py-4 spread; flex-1 fills remaining height.
                C-6: HARD-offline → overlay (last known levels). */}
            <div className="flex-1 min-h-0">
            <DisconnectedOverlay active={mixerOffline}>
                <ScrollFade snap className="h-full" scrollClassName="flex flex-row gap-6 px-6 py-4 min-h-[280px]">
                    {/* Master bus fader (leftmost) — `on` reads the authoritative
                        bus mute (X32 `/bus/MM/mix/on`); pre-v10.0.7 snapshots default
                        to `true` (unmuted) via the coerce-state guard. */}
                    <VerticalFaderStrip
                        label="Master"
                        value={myBus.fader}
                        on={myBus.on ?? true}
                        isMaster
                        stale={stale}
                        snapshotSeq={snapshotSeq}
                        unconfirmed={unconfirmed.includes(busFaderKey(myBusIndex))}
                        rejection={rejections[busFaderKey(myBusIndex)] ?? null}
                        onChange={handleBusMaster}
                        onMuteToggle={() => handleBusOn(!(myBus.on ?? true))}
                    />

                    {/* Divider between master and channels — slightly stronger break for the wider layout */}
                    {visibleSends.length > 0 && (
                        <div className="w-px bg-border/60 mx-2 self-stretch" />
                    )}

                    {/* Channel sends */}
                    {visibleSends.length === 0 ? (
                        <div className="flex items-center justify-center flex-1 text-[10px] text-muted-foreground">
                            No channels starred
                        </div>
                    ) : (
                        visibleSends.map(send => {
                            const ch = channelMap.get(send.channelIndex)
                            const name = ch?.name || `Ch ${send.channelIndex}`
                            return (
                                <VerticalFaderStrip
                                    key={send.channelIndex}
                                    label={name}
                                    value={send.level}
                                    on={send.on}
                                    stale={stale}
                                    snapshotSeq={snapshotSeq}
                                    unconfirmed={unconfirmed.includes(sendLevelKey(send.channelIndex, myBusIndex))}
                                    rejection={rejections[sendLevelKey(send.channelIndex, myBusIndex)] ?? null}
                                    onChange={(val) => handleSendLevel(send.channelIndex, val)}
                                    onMuteToggle={() => handleSendOn(send.channelIndex, !send.on)}
                                />
                            )
                        })
                    )}
                </ScrollFade>
            </DisconnectedOverlay>
            </div>
        </div>
    )
}
