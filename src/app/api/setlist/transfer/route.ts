import { NextResponse } from "next/server"
import { crossTenantSetlist } from "@/lib/org/setlist-tenant"
import { getT } from "@/i18n/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { transferSetlistSchema } from "@/lib/validations"
import { createApiHandler } from "@/lib/api-wrapper"

export const POST = createApiHandler(
    async ({ req, auth, body }) => {
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const { setlistId, newOwnerEmail } = body!
        const db = getFirestore()

        // Get Setlist
        const setlistRef = db.collection('setlists').doc(setlistId)
        const setlistSnap = await setlistRef.get()

        if (!setlistSnap.exists) {
            const t = await getT()
            return new NextResponse(t("api-setlist.setlistNotFound"), { status: 404 })
        }

        const foreign = crossTenantSetlist(setlistSnap.data(), auth.orgId, setlistId)
        if (foreign) return foreign

        // Find Target User
        let targetUser
        try {
            targetUser = await getAuth().getUserByEmail(newOwnerEmail)
        } catch (e: unknown) {
            if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'auth/user-not-found') {
                const t = await getT()
                return new NextResponse(t("api-setlist.transferUserNotFound", { email: newOwnerEmail }), { status: 404 })
            }
            throw e
        }

        const setlistData = setlistSnap.data()

        // Update Setlist
        await setlistRef.update({
            ownerId: targetUser.uid,
            ownerName: targetUser.displayName || targetUser.email || "Unknown User",
            transferredAt: new Date().toISOString(),
            previousOwnerId: auth.uid
        })

        const t = await getT()
        return NextResponse.json({
            success: true,
            message: t("api-setlist.transferred", { setlistName: String(setlistData?.name), email: String(targetUser.email) }),
        })
    },
    { role: 'admin', schema: transferSetlistSchema }
)
