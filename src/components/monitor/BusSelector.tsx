"use client"

import { MonitorConfig } from "@/types/monitor"

interface BusSelectorProps {
    config: MonitorConfig
    userId: string
    onSelect: (busIndex: number) => void
}

export function BusSelector({ config, userId, onSelect }: BusSelectorProps) {
    const allBuses = config.monitorBuses || []

    if (allBuses.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg font-medium mb-2">No monitor buses configured</p>
                <p className="text-sm">Ask a sound engineer or admin to set up monitor buses.</p>
            </div>
        )
    }

    const hasAvailable = allBuses.some(busIdx => {
        const assignment = config.busAssignments[String(busIdx)]
        return !assignment || assignment.userId === userId
    })

    return (
        <div className="text-center py-8">
            <p className="text-lg font-medium mb-2">Select your monitor bus</p>
            <p className="text-sm text-muted-foreground mb-6">
                Choose which wedge monitor you&apos;re using
            </p>
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
                {allBuses.map(busIdx => {
                    const assignment = config.busAssignments[String(busIdx)]
                    const isMine = assignment?.userId === userId
                    const isTaken = !!assignment && !isMine

                    return (
                        <button
                            key={busIdx}
                            onClick={() => !isTaken && onSelect(busIdx)}
                            disabled={isTaken}
                            className={`p-4 rounded-xl border text-left transition-colors ${
                                isMine
                                    ? "bg-violet-500/10 border-violet-500/50 text-violet-600 dark:text-violet-400"
                                    : isTaken
                                        ? "bg-muted/50 border-border/50 opacity-60 cursor-not-allowed"
                                        : "bg-card border-border hover:border-violet-500/50"
                            }`}
                        >
                            <div className="font-medium">Bus {busIdx}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {isMine
                                    ? "Currently assigned to you"
                                    : isTaken
                                        ? `${assignment.userName}`
                                        : "Available"}
                            </div>
                        </button>
                    )
                })}
            </div>
            {!hasAvailable && (
                <p className="text-sm text-muted-foreground mt-6">
                    All buses are assigned. Ask the sound engineer to assign you one.
                </p>
            )}
        </div>
    )
}
