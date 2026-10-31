"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { useMonitorStore } from "@/lib/monitor-store"

/**
 * BET-4 saved mixes for one bus, over /api/monitor/mixes. On every load it
 * also records the newest saved levels as the bus's "home" levels, which the
 * faders' double-tap returns to.
 */

export interface SavedMixSummary {
    id: string
    kind: "auto" | "named"
    name: string | null
    serviceType: string | null
    createdAt: string | null
    channelCount: number
    masterDb: number | null
}

export interface RecallPreviewChange {
    target: "master" | "send"
    channelIndex: number | null
    channelName: string
    before: { level: number; db: number | null; on: boolean }
    after: { level: number; db: number | null; on: boolean }
    heldAtLimit: boolean
}

export interface RecallPreview {
    busIndex: number
    changes: RecallPreviewChange[]
    unmatched: Array<{ channelIndex: number; channelName: string }>
    unchanged: number
}

interface ListResponse {
    ok: true
    busIndex: number
    named: SavedMixSummary[]
    auto: SavedMixSummary[]
    home: { master: number | null; sends: Record<string, number> } | null
}

async function json<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => null)) as T | null
    if (!res.ok || !body) throw new Error(`HTTP ${res.status}`)
    return body
}

export function useSavedMixes(busIndex: number | null, enabled = true) {
    const setHomeLevels = useMonitorStore((s) => s.setHomeLevels)
    const [named, setNamed] = useState<SavedMixSummary[]>([])
    const [auto, setAuto] = useState<SavedMixSummary[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)

    const reload = useCallback(async () => {
        if (busIndex == null || !enabled) return
        setLoading(true)
        setError(false)
        try {
            const body = await json<ListResponse>(await apiFetch(`/api/monitor/mixes?busIndex=${busIndex}`))
            setNamed(body.named)
            setAuto(body.auto)
            const sends: Record<number, number> = {}
            for (const [k, v] of Object.entries(body.home?.sends ?? {})) sends[Number(k)] = v
            setHomeLevels(busIndex, { master: body.home?.master ?? null, sends })
        } catch {
            setError(true)
        } finally {
            setLoading(false)
        }
    }, [busIndex, enabled, setHomeLevels])

    useEffect(() => {
        void reload()
    }, [reload])

    const save = useCallback(
        async (name: string, serviceType: string | null) => {
            if (busIndex == null) throw new Error("no bus")
            await json(
                await apiFetch("/api/monitor/mixes", {
                    method: "POST",
                    body: JSON.stringify({ busIndex, name, serviceType }),
                }),
            )
            await reload()
        },
        [busIndex, reload],
    )

    const preview = useCallback(
        async (snapshotId: string): Promise<RecallPreview> => {
            if (busIndex == null) throw new Error("no bus")
            return json<RecallPreview>(
                await apiFetch("/api/monitor/mixes/recall", {
                    method: "POST",
                    body: JSON.stringify({ busIndex, snapshotId, dryRun: true }),
                }),
            )
        },
        [busIndex],
    )

    /** Resolves to "partial" when the recall stopped partway (some faders moved). */
    const recall = useCallback(
        async (snapshotId: string): Promise<"done" | "partial"> => {
            if (busIndex == null) throw new Error("no bus")
            const body = await json<{ committed?: boolean | "partial" }>(
                await apiFetch("/api/monitor/mixes/recall", {
                    method: "POST",
                    body: JSON.stringify({ busIndex, snapshotId, dryRun: false }),
                }),
            )
            return body.committed === "partial" ? "partial" : "done"
        },
        [busIndex],
    )

    return { named, auto, loading, error, reload, save, preview, recall }
}
