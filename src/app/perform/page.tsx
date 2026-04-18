"use client"

/**
 * /perform -- Public setlist landing page.
 *
 * Non-signed-in visitors see a list of public setlists they can browse
 * and tap into. No authentication required -- middleware already allows
 * /perform/* routes for unauthenticated users.
 */

import { PublicSetlistListing } from "@/components/performance/PublicSetlistListing"

export default function PerformPage() {
    return <PublicSetlistListing />
}
