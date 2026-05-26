/**
 * Cycle-3 NEW-4 (A4) — /manage/library-review
 *
 * Server-component shell. Admin-gates via the session cookie + initial
 * server-side queue fetch so the client component renders with data on
 * first paint. Subsequent refetches go through `/api/admin/library-review/queue`.
 */

import { redirect } from "next/navigation"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readReviewQueue } from "@/lib/library/review-queue"
import { getServerUser } from "@/lib/server-auth"

import LibraryReviewClient from "./LibraryReviewClient"
import { formatError } from "@/lib/format-error"

export const dynamic = "force-dynamic"

export default async function LibraryReviewPage() {
    const user = await getServerUser()
    if (!user) {
        redirect("/login?next=/manage/library-review")
    }
    if (!user.isAdmin) {
        // Admin-only — band_leader doesn't see the review surface (per A4 spec).
        redirect("/manage")
    }

    if (!initAdmin()) {
        // Surface the failure but don't crash the route — client shows error state.
        return (
            <LibraryReviewClient
                initial={null}
                initialError="Firebase Admin SDK failed to initialize on the server."
            />
        )
    }

    try {
        const initial = await readReviewQueue(getFirestore())
        return <LibraryReviewClient initial={initial} initialError={null} />
    } catch (err) {
        const message = formatError(err)
        return (
            <LibraryReviewClient
                initial={null}
                initialError={`Initial queue load failed: ${message}`}
            />
        )
    }
}
