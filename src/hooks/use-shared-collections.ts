"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { useAuth } from "@/lib/auth-context"
import {
    chipCollections,
    ownerShortName,
    readChipPrefs,
    rowsForChips,
    sectionRows,
    visibilitySectionsFor,
    writeChipPrefs,
    type SharedCollection,
    type SharedFile,
} from "@/lib/library/shared-collections"
import {
    loadOwnerName,
    loadSharedCollections,
    loadSharedRows,
    onSharedCacheInvalidated,
    type SharedRowsResult,
} from "@/lib/library/shared-source"
import { codeOrgConfig } from "@/lib/org/config-code"
import { peekOrgConfig } from "@/lib/org/config-cache"
import { useOrg } from "@/lib/org/org-context"
import type { OrgId } from "@/lib/org/types"

function useInvalidationTick(): number {
    const [tick, setTick] = useState(0)
    useEffect(() => onSharedCacheInvalidated(() => setTick((t) => t + 1)), [])
    return tick
}

/** Shared rows for this tenant, read only while `wanted`. */
function useSharedRows(org: OrgId, uid: string | null, wanted: boolean, tick: number): SharedRowsResult | null {
    const [result, setResult] = useState<SharedRowsResult | null>(null)
    useEffect(() => {
        if (!uid || !wanted) {
            setResult(null)
            return
        }
        let live = true
        void loadSharedRows(org, uid).then((r) => {
            if (live) setResult(r)
        })
        return () => {
            live = false
        }
    }, [org, uid, wanted, tick])
    return result
}

/**
 * Rows another tenant owns that feed one of this tenant's own sections with
 * no chip (CRC's "Nava Tehilah" tab after the nava move, ruling 6). Empty for
 * a tenant with no such section, and before anything is shared.
 */
export function useSharedSectionRows(): SharedFile[] {
    const org = useOrg()
    const { user } = useAuth()
    const tick = useInvalidationTick()
    const wanted = visibilitySectionsFor(org).length > 0
    const result = useSharedRows(org, user?.uid ?? null, wanted, tick)
    return useMemo(() => (result ? sectionRows(result.rows, org) : []), [result, org])
}

export interface SharedChip extends SharedCollection {
    owner: string
    on: boolean
}

export interface SharedCollectionsState {
    chips: SharedChip[]
    toggle: (collectionId: string) => void
    /** Shared rows of the switched-on chips, alphabetical. */
    chipRows: SharedFile[]
    owner: (orgId: string) => string
    loading: boolean
    failed: boolean
}

/**
 * The opt-in chips for collections other tenants share with this one. Off
 * until switched on; remembered per user and tenant. Rows load only once a
 * chip is on.
 */
export function useSharedCollections(extraOwnerIds: readonly string[] = []): SharedCollectionsState {
    const org = useOrg()
    const { user } = useAuth()
    const uid = user?.uid ?? null
    const tick = useInvalidationTick()

    const [records, setRecords] = useState<SharedCollection[]>([])
    useEffect(() => {
        if (!uid) {
            setRecords([])
            return
        }
        let live = true
        void loadSharedCollections(org, uid).then((r) => {
            if (live) setRecords(r)
        })
        return () => {
            live = false
        }
    }, [org, uid, tick])

    const [onIds, setOnIds] = useState<Set<string>>(() => readChipPrefs(uid, org))
    useEffect(() => setOnIds(readChipPrefs(uid, org)), [uid, org])

    const offered = useMemo(() => chipCollections(records, org), [records, org])
    const activeIds = useMemo(() => new Set(offered.filter((c) => onIds.has(c.id)).map((c) => c.id)), [offered, onIds])

    const result = useSharedRows(org, uid, activeIds.size > 0, tick)

    // Names for owners the code tables do not know (a tenant created later).
    const [fetchedNames, setFetchedNames] = useState<Map<string, string>>(() => new Map())
    const extraKey = [...new Set(extraOwnerIds)].sort().join(",")
    useEffect(() => {
        const owners = [...offered.map((c) => c.ownerOrgId), ...(extraKey ? extraKey.split(",") : [])]
        const unknown = [...new Set(owners)].filter(
            (o) => !(peekOrgConfig(o) ?? codeOrgConfig(o)),
        )
        if (unknown.length === 0) return
        let live = true
        void Promise.all(unknown.map(async (o) => [o, await loadOwnerName(o)] as const)).then((pairs) => {
            if (!live) return
            setFetchedNames(new Map(pairs.filter((p): p is readonly [string, string] => !!p[1])))
        })
        return () => {
            live = false
        }
    }, [offered, extraKey])

    const owner = useCallback((orgId: string) => ownerShortName(orgId, fetchedNames), [fetchedNames])

    const toggle = useCallback(
        (collectionId: string) => {
            setOnIds((prev) => {
                const next = new Set(prev)
                if (next.has(collectionId)) next.delete(collectionId)
                else next.add(collectionId)
                writeChipPrefs(uid, org, next)
                return next
            })
        },
        [uid, org, setOnIds],
    )

    const chips = useMemo(
        () => offered.map((c) => ({ ...c, owner: owner(c.ownerOrgId), on: activeIds.has(c.id) })),
        [offered, owner, activeIds],
    )
    const chipRows = useMemo(() => (result ? rowsForChips(result.rows, activeIds, org) : []), [result, activeIds, org])

    return {
        chips,
        toggle,
        chipRows,
        owner,
        loading: activeIds.size > 0 && result === null,
        failed: !!result?.failed,
    }
}
