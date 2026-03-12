import { getServerUser, serializeSetlist } from "@/lib/server-auth"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { Setlist } from "@/lib/setlist-firebase"
import { notFound, redirect } from "next/navigation"
import { SetlistEditorV2 } from "@/components/setlist/v2/SetlistEditorV2"

// Note for Next.js 15: params/searchParams must be strings/Promises depending on exact Next.js versions.
// We are on Next.js 16.1.4, so we MUST await `params` and `searchParams`.
export default async function SetlistEditorPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ public?: string }>
}) {
    const { id } = await params
    const resolvedParams = await searchParams
    const isPublic = resolvedParams.public === "true"

    const user = await getServerUser()
    const isNew = id === "new"

    if (!user && !isPublic) {
        // Can't edit without login, but can view public (though this is an editor page!)
        redirect("/login")
    }

    let existingSetlist: Setlist | null = null

    if (!isNew) {
        initAdmin()
        const db = getFirestore()

        const doc = await db.collection("setlists").doc(id).get()
        if (!doc.exists) notFound()

        const data = doc.data() as any

        if (isPublic) {
            if (!data.isPublic && data.ownerId && data.ownerId !== user?.uid && !user?.isAdmin) {
                // Unauthorized for public view if it's not actually public and we don't own it
                redirect("/setlists")
            }
        } else {
            // Personal setlist
            if (!user) redirect("/login")
            if (data.ownerId && data.ownerId !== user.uid && !user.isAdmin) {
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
