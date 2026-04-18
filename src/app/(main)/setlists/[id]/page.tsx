import { getServerUser, serializeSetlist } from "@/lib/server-auth"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { Setlist } from "@/lib/setlist-firebase"
import { notFound, redirect } from "next/navigation"
import { SetlistEditorV2 } from "@/components/setlist/v2/SetlistEditorV2"
import { canEditSetlist } from "@/lib/setlist-permissions"

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

    let existingSetlist: Setlist | null = null

    if (!isNew) {
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

        existingSetlist = serializeSetlist(doc.id, data) as unknown as Setlist
    }

    return (
        <SetlistEditorV2
            key={id}
            setlistId={isNew ? undefined : id}
            initialTracks={isNew ? [] : (existingSetlist?.tracks || [])}
            initialName={isNew ? "" : existingSetlist?.name}
            initialOwnerId={existingSetlist?.ownerId}
            initialEventDate={existingSetlist?.eventDate as any}
            initialRabbi={existingSetlist?.rabbi}
            initialServiceNotes={existingSetlist?.serviceNotes}
            initialMusicians={existingSetlist?.musicians}
            initialTemplateType={existingSetlist?.templateType}
            isNew={isNew}
        />
    )
}
