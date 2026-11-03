/** /listen/[id] is now /rehearse/[id]; a permanent redirect keeps old links working. */
import { notFound, permanentRedirect } from "next/navigation"

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export default async function ListenRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ID_RE.test(id)) notFound()
    permanentRedirect(`/rehearse/${id}`)
}
