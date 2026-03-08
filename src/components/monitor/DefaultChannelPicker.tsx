"use client"

import { useCallback, useEffect, useState } from "react"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useMonitorStore } from "@/lib/monitor-store"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { Check, ListChecks, Loader2 } from "lucide-react"
import { toast } from "sonner"

/**
 * DefaultChannelPicker -- sound engineer selects global default visible channels.
 * These channels appear in every musician's live popup automatically.
 * Saved to Firestore config/monitor.defaultChannels.
 */
export function DefaultChannelPicker() {
    const { isSoundEngineer, isAdmin } = useMonitorAccess()
    const channels = useMonitorStore(s => s.channels)
    const storeDefaultChannels = useMonitorStore(s => s.defaultChannels)
    const setDefaultChannels = useMonitorStore(s => s.setDefaultChannels)

    const [selected, setSelected] = useState<number[]>([])
    const [saving, setSaving] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Load default channels from Firestore on mount
    useEffect(() => {
        getDoc(doc(db, "config", "monitor")).then(snap => {
            if (snap.exists()) {
                const data = snap.data()
                const defaults = data.defaultChannels || []
                setSelected(defaults)
                setDefaultChannels(defaults)
            }
            setLoaded(true)
        }).catch(() => setLoaded(true))
    }, [setDefaultChannels])

    // Sync from store if it changes externally
    useEffect(() => {
        if (loaded && storeDefaultChannels.length > 0 && JSON.stringify(storeDefaultChannels) !== JSON.stringify(selected)) {
            setSelected(storeDefaultChannels)
        }
     
    }, [storeDefaultChannels])

    const toggleChannel = useCallback(async (channelIndex: number) => {
        const next = selected.includes(channelIndex)
            ? selected.filter(c => c !== channelIndex)
            : [...selected, channelIndex].sort((a, b) => a - b)

        setSelected(next)
        setDefaultChannels(next)
        setSaving(true)

        try {
            await updateDoc(doc(db, "config", "monitor"), {
                defaultChannels: next,
            })
        } catch {
            toast.error("Failed to save default channels")
        } finally {
            setSaving(false)
        }
    }, [selected, setDefaultChannels])

    // Only sound engineers or admins can use this -- render nothing for others
    if (!isSoundEngineer && !isAdmin) return null

    if (!loaded) {
        return (
            <div className="flex justify-center p-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-muted-foreground" />
                    Default Visible Channels
                </h3>
                <div className="flex items-center gap-2">
                    {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">
                        {selected.length} of {channels.length} selected
                    </span>
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                These channels appear in every musician&apos;s live monitor popup by default.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                {channels.map(ch => {
                    const isSelected = selected.includes(ch.index)
                    return (
                        <button
                            key={ch.index}
                            onClick={() => toggleChannel(ch.index)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors min-h-[44px] ${
                                isSelected
                                    ? "bg-brand/10 border border-brand/30 text-foreground"
                                    : "bg-zinc-900/40 border border-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/60"
                            }`}
                        >
                            <div className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                                isSelected
                                    ? "bg-brand border-brand"
                                    : "border-zinc-600"
                            }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="truncate">{ch.name || `Ch ${ch.index}`}</span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
