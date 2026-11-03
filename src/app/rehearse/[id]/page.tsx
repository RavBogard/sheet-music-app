/**
 * /rehearse/[id]: the quiet band-preparation page. Every song of a setlist in
 * the author's order with its key, BPM, notes, its one recording and, when a
 * chart is bonded, a Chart button into /rehearse/[id]/track/[trackId].
 *
 * Public like /perform. Each tenant sees only its own setlists (404 on another
 * tenant's host). Perform links here, but never on the service day.
 */
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { hasFeature } from "@/lib/org/features"
import { requestOrg } from "@/lib/org/request-org"

import { RehearseClient } from "./RehearseClient"
import { ID_RE, loadRehearse } from "./load"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function RehearsePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ID_RE.test(id)) notFound()
    const data = await loadRehearse(id)
    if (!data) notFound()
    const chartsEnabled = await hasFeature((await requestOrg()).orgId, "perform")
    return <RehearseClient setlistId={id} chartsEnabled={chartsEnabled} name={data.name} eventDate={data.eventDate} rows={data.rows} />
}
