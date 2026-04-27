import { getServerUser, serializeSetlist } from "@/lib/server-auth"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { Setlist } from "@/lib/setlist-firebase"
import { notFound, redirect } from "next/navigation"
import {
    DeleteConfirmProvider,
    ReconciliationProvider,
    SetlistGrid,
    SetlistGridHydrator,
} from "@/components/setlist/grid"
import { canEditSetlist } from "@/lib/setlist-permissions"
import type { LocalSetlist, LocalTrack } from "@/lib/local/types"
import { randomUUID } from "node:crypto"

function toMs(value: unknown): number {
    if (value == null) return 0
    if (typeof value === "number") return value
    if (typeof value === "string") {
        const t = Date.parse(value)
        return Number.isNaN(t) ? 0 : t
    }
    return 0
}

function buildLocalSetlist(
    serialized: Record<string, unknown> & { id: string },
): LocalSetlist {
    const updatedAt = toMs(serialized.updatedAt)
    const eventDate = serialized.eventDate ? toMs(serialized.eventDate) : undefined
    const ownerId = (serialized.ownerId as string | undefined) ?? ""
    return {
        ...serialized,
        id: serialized.id,
        ownerId,
        updatedAt,
        eventDate,
    }
}

function buildLocalTracks(
    setlistId: string,
    setlistUpdatedAt: number,
    rawTracks: unknown,
): LocalTrack[] {
    if (!Array.isArray(rawTracks)) return []
    return rawTracks.map((t, index) => {
        const track = (t ?? {}) as Record<string, unknown>
        return {
            ...track,
            id: String(track.id ?? `${setlistId}-${index}`),
            setlistId,
            order: typeof track.order === "number" ? track.order : index,
            updatedAt: setlistUpdatedAt,
        } as LocalTrack
    })
}

// Note for Next.js 15: params/searchParams must be strings/Promises depending on exact Next.js versions.
// We are on Next.js 16.1.4, so we MUST await `params` and `searchParams`.
export default async function SetlistEditorPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    const user = await getServerUser()
    const isNew = id === "new"

    if (!user) {
        redirect("/login")
    }

    if (isNew) {
        const newId = randomUUID()
        return (
            <DeleteConfirmProvider>
                <ReconciliationProvider>
                    <SetlistGrid setlistId={newId} />
                </ReconciliationProvider>
            </DeleteConfirmProvider>
        )
    }

    initAdmin()
    const db = getFirestore()

    const doc = await db.collection("setlists").doc(id).get()
    if (!doc.exists) notFound()

    const data = doc.data() as any

    // v4.0: Leaders/admins can edit any setlist; owners can edit their own
    const canEdit = canEditSetlist(data, {
        uid: user.uid,
        isBandLeader: user.isBandLeader,
        isAdmin: user.isAdmin,
    })

    if (!canEdit) {
        // Non-editors get sent to the performance view
        redirect(`/perform/setlist/${id}`)
    }

    const serialized = serializeSetlist(doc.id, data) as Record<string, unknown> & {
        id: string
    }
    const initialSetlist = buildLocalSetlist(serialized)
    const initialTracks = buildLocalTracks(
        id,
        initialSetlist.updatedAt,
        serialized.tracks,
    )

    const setlistName =
        typeof serialized.name === "string" ? serialized.name : undefined

    return (
        <DeleteConfirmProvider>
            <ReconciliationProvider>
                <SetlistGridHydrator
                    key={id}
                    setlistId={id}
                    initialSetlist={initialSetlist}
                    initialTracks={initialTracks}
                    gridProps={{ name: setlistName }}
                />
            </ReconciliationProvider>
        </DeleteConfirmProvider>
    )
}
