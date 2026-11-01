'use client'

import { useEffect, useState } from 'react'

import { useOrg } from '@/lib/org/org-context'
import { subscribeFeaturedBySong } from '@/lib/recordings/featured-client'
import type { OrgId } from '@/lib/org/types'
import type { Recording } from '@/types/models'

type Map = Record<string, Recording>

/**
 * One shared listener per org however many rows ask (a setlist has dozens,
 * the library hundreds), counted so it detaches when the last row unmounts.
 */
const stores = new globalThis.Map<
    OrgId,
    { value: Map | null; listeners: Set<(m: Map) => void>; unsub: () => void }
>()

function attach(orgId: OrgId, listener: (m: Map) => void): () => void {
    let store = stores.get(orgId)
    if (!store) {
        const created = {
            value: null as Map | null,
            listeners: new Set<(m: Map) => void>(),
            unsub: () => {},
        }
        created.unsub = subscribeFeaturedBySong(orgId, (m) => {
            created.value = m
            created.listeners.forEach((l) => l(m))
        })
        stores.set(orgId, created)
        store = created
    }
    store.listeners.add(listener)
    if (store.value) listener(store.value)
    return () => {
        const s = stores.get(orgId)
        if (!s) return
        s.listeners.delete(listener)
        if (s.listeners.size === 0) {
            s.unsub()
            stores.delete(orgId)
        }
    }
}

const EMPTY: Map = {}

/** songId -> that song's featured playable take, for the current tenant. Empty until loaded. */
export function useFeaturedBySong(): Map {
    const orgId = useOrg()
    const [map, setMap] = useState<Map>(EMPTY)
    useEffect(() => attach(orgId, setMap), [orgId])
    return map
}
