import { getServerUser, serializeSetlist } from "@/lib/server-auth"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { Setlist } from "@/lib/setlist-firebase"
import { notFound, redirect } from "next/navigation"
import { SetlistEditorV2 } from "@/components/setlist/v2/SetlistEditorV2"

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

        // Determine if the current user has EDIT access to this setlist
        const isOwner = data.ownerId === user.uid
        const canEdit = isOwner || user.isAdmin || (user.isBandLeader && data.isPublic)

        if (!canEdit) {
            if (data.isPublic) {
                // If it's public but they can't edit it (e.g. a standard musician), send them to the performance view
                redirect(`/perform/setlist/${id}`)
            } else {
                // If it's private and they aren't the owner/admin, bounce them out completely
                redirect("/setlists")
            }
        }

        existingSetlist = serializeSetlist(doc.id, data) as unknown as Setlist
    }

    return (
        <SetlistEditorV2
            key={id}
            setlistId={isNew ? undefined : id}
            initialTracks={isNew ? [] : (existingSetlist?.tracks || [])}
            initialName={isNew ? "" : existingSetlist?.name}
            initialIsPublic={existingSetlist?.isPublic || false}
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
