"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { MatrixPanel } from "@/components/monitor/MatrixPanel"
import { BusAssignmentPanel } from "@/components/monitor/BusAssignmentPanel"
import { DefaultChannelPicker } from "@/components/monitor/DefaultChannelPicker"
import { ConnectionIndicator, DisconnectedOverlay, isMixerOffline } from "@/components/monitor/ConnectionIndicator"
import { getVisibleChannels, useMonitorStore } from "@/lib/monitor-store"
import { busFaderKey, sendLevelKey } from "@/lib/monitor/target-key"
import { useMonitorStaleness } from "@/lib/monitor/use-monitor-staleness"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { BusInfo, BusSend, ChannelInfo, MatrixInfo, MonitorConfig } from "@/types/monitor"
import type { ConnectionStatus } from "@/lib/firestore-monitor-client"

interface MonitorTabsProps {
    myBus: BusInfo
    channels: ChannelInfo[]
    allSends: BusSend[]
    starredChannels: number[]
    defaultChannels: number[]
    hasEngineerAccess: boolean
    config: MonitorConfig | null
    matrices: MatrixInfo[]
    status: ConnectionStatus
    error: string | null
    /** Authoritative snapshot sequence (store `snapshotCount`) for the fader confirmation machine (C-2). */
    snapshotSeq?: number
    onBusMaster: (value: number) => void
    /**
     * Master-mute toggle. The horizontal `FaderStrip` carries no mute UI on this
     * surface (display-only on mute via opacity-50), so this prop is currently
     * unused by `MonitorTabs` itself — kept on the contract to keep `MonitorClient`
     * symmetric with `QuickMonitorPanel` and future-proof for a redesign that
     * adds an inline mute affordance (coder-5's redesign track may pick this up).
     */
    onBusOn: (on: boolean) => void
    onSendLevel: (channelIndex: number, value: number) => void
    onSendOn: (channelIndex: number, on: boolean) => void
    onMatrixFader: (matrixIndex: number, value: number) => void
    onMatrixOn: (matrixIndex: number, on: boolean) => void
    onToggleStar: (channelIndex: number) => void
}

function HealthIndicator() {
    // C-6: staleness from the bridge's own `state.updatedAt` (90s threshold) —
    // the same authoritative signal the MCP uses — not the `lastSnapshotAt`
    // proxy, which reads "Live" on load against a long-frozen desk.
    const { stale, hasState } = useMonitorStaleness()

    if (!hasState) return null

    return (
        <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                stale
                    ? "bg-yellow-500/15 text-yellow-500"
                    : "bg-emerald-500/15 text-emerald-500"
            }`}
        >
            <span
                className={`size-2 rounded-full ${
                    stale
                        ? "bg-yellow-500"
                        : "bg-emerald-500 animate-pulse motion-reduce:animate-none"
                }`}
            />
            {stale ? "Stale" : "Live"}
        </span>
    )
}

export function MonitorTabs({
    myBus,
    channels,
    allSends,
    starredChannels,
    defaultChannels,
    hasEngineerAccess,
    config,
    matrices,
    status,
    error,
    snapshotSeq,
    onBusMaster,
    onBusOn: _onBusOn,
    onSendLevel,
    onSendOn,
    onMatrixFader,
    onMatrixOn,
    onToggleStar,
}: MonitorTabsProps) {
    const channelMap = new Map(channels.map(c => [c.index, c]))
    const visibleIndices = getVisibleChannels(defaultChannels, starredChannels, allSends)
    const visibleSends = allSends.filter(s => visibleIndices.includes(s.channelIndex))
    const myBusIndex = myBus.index

    // C-6: per-fader staleness cue (idle/frozen state, control still works) +
    // full DisconnectedOverlay only when control is HARD-offline (bridge/X32 down).
    const { stale } = useMonitorStaleness()
    const mixerOffline = isMixerOffline(status, config?.bridge)
    // R5 / R2: keyed by the bridge's own target-key vocabulary (see target-key.ts).
    const unconfirmed = useMonitorStore(s => s.unconfirmed) ?? []
    const rejections = useMonitorStore(s => s.rejections) ?? {}
    const masterKey = busFaderKey(myBusIndex)

    return (
        <div className="max-w-lg mx-auto p-4 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold truncate pr-4">
                    {myBus.name && myBus.name !== `Bus ${myBusIndex}` ? myBus.name : "My Monitor"}
                </h1>
                <div className="flex items-center gap-2">
                    <HealthIndicator />
                    <ConnectionIndicator status={status} bridgeStatus={config?.bridge} error={error} />
                </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                Bus {myBusIndex}
            </p>

            {/* Tabbed Interface */}
            <Tabs defaultValue="my-mix">
                <TabsList className="w-full grid grid-cols-auto mb-4" style={{
                    gridTemplateColumns: hasEngineerAccess ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
                }}>
                    <TabsTrigger value="my-mix" className="min-h-[44px] text-sm font-medium">
                        My Mix
                    </TabsTrigger>
                    <TabsTrigger value="channels" className="min-h-[44px] text-sm font-medium">
                        Channels
                    </TabsTrigger>
                    {hasEngineerAccess && (
                        <TabsTrigger value="bus" className="min-h-[44px] text-sm font-medium">
                            Configure
                        </TabsTrigger>
                    )}
                    {hasEngineerAccess && (
                        <TabsTrigger value="matrix" className="min-h-[44px] text-sm font-medium">
                            Matrix
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* My Mix Tab */}
                <TabsContent value="my-mix" className="space-y-4">
                    <DisconnectedOverlay active={mixerOffline}>
                        <div className="space-y-4">
                            {/* Master fader */}
                            <div className="bg-card border border-brand/10 rounded-xl p-4">
                                <FaderStrip
                                    label="Master"
                                    value={myBus.fader}
                                    on={myBus.on ?? true}
                                    isMaster
                                    stale={stale} snapshotSeq={snapshotSeq}
                                    unconfirmed={unconfirmed.includes(masterKey)}
                                    rejection={rejections[masterKey] ?? null}
                                    onChange={onBusMaster}
                                />
                            </div>

                            {/* Visible channels (starred + defaults) */}
                            <div className="bg-card border border-brand/10 rounded-xl p-4">
                                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                                    My Channels
                                </h2>
                                {visibleSends.length > 0 ? (
                                    <div className="space-y-1">
                                        {visibleSends.map(send => {
                                            const ch = channelMap.get(send.channelIndex)
                                            const name = ch?.name || `Ch ${send.channelIndex}`
                                            return (
                                                <div key={send.channelIndex} className="flex-1 min-w-0">
                                                    <FaderStrip
                                                        label={name}
                                                        value={send.level}
                                                        on={send.on}
                                                        stale={stale} snapshotSeq={snapshotSeq}
                                                        unconfirmed={unconfirmed.includes(sendLevelKey(send.channelIndex, myBusIndex))}
                                                        rejection={rejections[sendLevelKey(send.channelIndex, myBusIndex)] ?? null}
                                                        onChange={(val) => onSendLevel(send.channelIndex, val)}
                                                        onUnmuteCheck={() => onSendOn(send.channelIndex, true)}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground py-4 text-center">
                                        No channels in your mix yet. Go to the <strong>Channels</strong> tab and tap{" "}
                                        <Star className="w-3 h-3 inline text-yellow-500" /> to add channels.
                                    </p>
                                )}
                            </div>
                        </div>
                    </DisconnectedOverlay>
                </TabsContent>

                {/* Channels Tab (All Channels) */}
                <TabsContent value="channels" className="space-y-4">
                    <DisconnectedOverlay active={mixerOffline}>
                    <div className="space-y-4">
                    {/* Master fader */}
                    <div className="bg-card border border-brand/10 rounded-xl p-4">
                        <FaderStrip
                            label="Master"
                            value={myBus.fader}
                            on={true}
                            isMaster
                            stale={stale} snapshotSeq={snapshotSeq}
                            unconfirmed={unconfirmed.includes(masterKey)}
                            rejection={rejections[masterKey] ?? null}
                            onChange={onBusMaster}
                        />
                    </div>

                    <div className="bg-card border border-brand/10 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-medium text-muted-foreground">All Channels</h2>
                            <p className="text-xs text-muted-foreground">
                                Tap <Star className="w-3 h-3 inline text-yellow-500" /> to add to your mix
                            </p>
                        </div>
                        <div className="space-y-1">
                            {allSends.map(send => {
                                const ch = channelMap.get(send.channelIndex)
                                const name = ch?.name || `Ch ${send.channelIndex}`
                                const isStarred = starredChannels.includes(send.channelIndex)
                                const isDefault = defaultChannels.includes(send.channelIndex)
                                return (
                                    <div key={send.channelIndex} className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onToggleStar(send.channelIndex)}
                                            className={
                                                isStarred
                                                    ? "text-yellow-500"
                                                    : "text-zinc-700 hover:text-zinc-500"
                                            }
                                            title={isStarred ? "Remove from my mix" : "Add to my mix"}
                                        >
                                            <Star className="w-4 h-4" fill={isStarred ? "currentColor" : "none"} />
                                        </Button>
                                        <div className="flex-1 min-w-0">
                                            <FaderStrip
                                                label={name}
                                                value={send.level}
                                                on={send.on}
                                                stale={stale} snapshotSeq={snapshotSeq}
                                                unconfirmed={unconfirmed.includes(sendLevelKey(send.channelIndex, myBusIndex))}
                                                rejection={rejections[sendLevelKey(send.channelIndex, myBusIndex)] ?? null}
                                                onChange={(val) => onSendLevel(send.channelIndex, val)}
                                                onUnmuteCheck={() => onSendOn(send.channelIndex, true)}
                                            />
                                        </div>
                                        {isDefault && (
                                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-brand/20 text-brand border border-brand/20">
                                                default
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                            {allSends.length === 0 && (
                                <p className="text-sm text-muted-foreground py-4 text-center">
                                    No channels routed to this bus yet.
                                </p>
                            )}
                        </div>
                    </div>
                    </div>
                    </DisconnectedOverlay>
                </TabsContent>

                {/* Bus Tab (Engineers Only) */}
                {hasEngineerAccess && (
                    <TabsContent value="bus" className="space-y-4">
                        {config && <BusAssignmentPanel config={config} />}
                        <DefaultChannelPicker />
                    </TabsContent>
                )}

                {/* Matrix Tab (Engineers Only) */}
                {hasEngineerAccess && (
                    <TabsContent value="matrix">
                        {matrices.length > 0 ? (
                            <MatrixPanel
                                matrices={matrices}
                                onFaderChange={onMatrixFader}
                                onToggle={onMatrixOn}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground py-8 text-center">
                                No matrix outputs available.
                            </p>
                        )}
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
}
