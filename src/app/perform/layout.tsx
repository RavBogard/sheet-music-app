import { notFound } from "next/navigation"
import { requestOrg } from "@/lib/org/request-org"
import { hasFeature } from "@/lib/org/features"
import { PerformClientLayout } from "./PerformClientLayout"

/**
 * Multi-tenant phase 6: Perform mode is a tenant flag (`perform`). Every
 * /perform route — the public listing, the setlist perform view and its track
 * sub-route, the single-chart view — answers 404 for a tenant with it off.
 * CRC and Brothers Lazaroff have it on, so their Perform links (texted to the
 * band, public by design) behave exactly as before.
 *
 * The client bootstraps (PDF worker warm-up, perform-shell service worker,
 * keep-awake) live unchanged in PerformClientLayout.
 */
export default async function PerformLayout({ children }: { children: React.ReactNode }) {
    const { orgId } = await requestOrg()
    if (!(await hasFeature(orgId, "perform"))) notFound()
    return <PerformClientLayout>{children}</PerformClientLayout>
}
