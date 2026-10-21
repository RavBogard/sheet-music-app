"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SharedRow } from "@/lib/beit-mitzvah/contract"

type ReviewRow = SharedRow & { audioFileId?: string | null }
interface Inspection {
    setlistId: string; sourceRevision: string; reviewRequired: boolean; status: string
    requestedLocalDate: string; requestedCeremonyType: string; rows: ReviewRow[]
    serviceName: string; localDate: string; ceremonyType: string
}
async function call(body: object) {
    const response = await apiFetch("/api/integrations/beit-mitzvah/review", { method: "POST", body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error === "stale_source" ? "The music changed. Refresh the service before approving." :
        data.error === "source_schedule_mismatch" ? "Update the date and service type in the music setlist first, then confirm the schedule here." :
        data.error === "resource_manifest_required" ? "A selected file needs an exact source catalog hash and Storage generation before it can be shared." :
        data.error === "integration_unconfigured" ? "The music connection has not been configured." : "The action could not be completed. Check your music access and refresh the service.")
    return data
}
function humanDate(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })
}
export default function BeitMitzvahReviewPage() {
    const { user, loading, role } = useAuth()
    const [ceremonyId, setCeremonyId] = useState("")
    const [source, setSource] = useState<Inspection | null>(null)
    const [selected, setSelected] = useState<string[]>([])
    const [files, setFiles] = useState<string[]>([])
    const [directions, setDirections] = useState<Record<string, string>>({})
    const [rights, setRights] = useState("")
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState("")
    const inspect = useCallback(async (id: string) => {
        setBusy(true); setMessage("")
        try {
            const data = await call({ operation: "inspect", ceremonyId: id }) as Inspection
            setSource(data); setSelected([]); setFiles([]); setRights("")
            setDirections(Object.fromEntries(data.rows.map(row => [row.rowId, row.sharedDirections ?? ""])))
        } catch (error) { setSource(null); setMessage((error as Error).message) } finally { setBusy(false) }
    }, [])
    const canReview = !!user && ["admin", "band_leader"].includes(role ?? "")
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get("ceremonyId") ?? ""
        setCeremonyId(id)
        if (canReview && id) void inspect(id)
    }, [canReview, inspect])
    async function save(operation: "approve" | "revoke" | "confirm_schedule") {
        if (!source) return
        setBusy(true); setMessage("")
        try {
            const resources = source.rows.flatMap(row => ["score", "audio"].flatMap(kind => {
                const fileId = kind === "score" ? row.arrangement?.fileId : row.audioFileId
                return selected.includes(row.rowId) && files.includes(`${row.rowId}:${kind}`) && fileId ? [{
                    rowId: row.rowId, resourceId: crypto.randomUUID(), kind, label: kind === "score" ? "Score" : "Reference audio", fileId, rightsBasis: rights,
                }] : []
            }))
            await call({ operation, ceremonyId, ...(operation !== "revoke" ? { expectedSourceRevision: source.sourceRevision } : {}),
                ...(operation === "approve" ? { rowIds: selected, sharedDirections: Object.fromEntries(selected.map(id => [id, directions[id] ?? ""])), resources } : {}),
            })
            setSource(null)
            setMessage(operation === "revoke" ? "Sharing withdrawn. New family requests for these rows and files are blocked." : operation === "confirm_schedule" ? "Schedule confirmed. Refresh the service to review what families can see." : "Review saved. Only the selected rows and files are shared with the assigned ceremony.")
        } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
    }
    const toggle = (id: string, values: string[], set: (values: string[]) => void) => set(values.includes(id) ? values.filter(value => value !== id) : [...values, id])
    if (loading) return <p className="p-6" role="status">Loading music access…</p>
    if (!user || !["admin", "band_leader"].includes(role ?? "")) return <p className="p-6">Sign in with your CRC music editor account to review family sharing.</p>
    return <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <header className="space-y-3">
            <h1 className="text-2xl font-semibold">Review family sharing</h1>
            <p className="text-muted-foreground">Choose the source rows, practice directions, and authorized files the assigned family may use. Private performance notes stay in the music setlist.</p>
        </header>
        {busy && !source && <p role="status">Loading the service for review…</p>}
        {!source && !busy && !message && <p>Open a ceremony’s sharing review from Beit Mitzvah to see its service here.</p>}
        {!source && ceremonyId && !busy && <Button variant="outline" onClick={() => void inspect(ceremonyId)}>Refresh service</Button>}
        {message && <p role="status" className="rounded-md border p-4">{message}</p>}
        {source && <section aria-label="Source service review" className="space-y-6">
            <header className="space-y-2">
                <h2 className="text-xl font-semibold">{source.serviceName}</h2>
                <p>{humanDate(source.localDate)} · {source.ceremonyType === "havdalah" ? "Havdalah service" : "Morning service"}</p>
            </header>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <a className="underline underline-offset-4" href={`/perform/setlist/${source.setlistId}`}>Open music setlist</a>
                <p>Sharing: {source.status}</p>
                <Button variant="outline" disabled={busy} onClick={() => void inspect(ceremonyId)}>Refresh service</Button>
            </div>
            {source.reviewRequired && <div className="space-y-3 rounded-md border p-4">
                <p>The schedule needs review. Update the music setlist to {source.requestedLocalDate}, {source.requestedCeremonyType}, then confirm the retained link.</p>
                <Button disabled={busy} onClick={() => void save("confirm_schedule")}>Confirm corrected schedule</Button>
            </div>}
            <p className="text-muted-foreground">Saving replaces the previous sharing approval. Select each row and file deliberately. A changed arrangement or text requires another review.</p>
            {source.rows.length === 0 && <p>This source setlist has no rows yet. Add the ceremony music in the setlist, then load it again.</p>}
            <ol className="divide-y">
                {source.rows.map(row => <li key={row.rowId} className="space-y-4 py-5">
                    <label className="flex items-start gap-3">
                        <input type="checkbox" checked={selected.includes(row.rowId)} onChange={() => toggle(row.rowId, selected, setSelected)} disabled={busy || source.reviewRequired} className="mt-1 h-4 w-4 accent-primary" />
                        <span className="font-medium">{row.title || "Untitled row"}</span>
                    </label>
                    {row.liturgyRef && <p className="text-sm text-muted-foreground">{row.liturgyRef.book}, page {row.liturgyRef.folio}</p>}
                    {selected.includes(row.rowId) && <div className="flex flex-col gap-3 ps-7">
                        <Label className="leading-snug" htmlFor={`directions-${row.rowId}`}>Directions shared with the family</Label>
                        <textarea id={`directions-${row.rowId}`} value={directions[row.rowId] ?? ""} onChange={event => setDirections({ ...directions, [row.rowId]: event.target.value })} maxLength={2000} rows={3} disabled={busy} className="w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        {([{ kind: "score", fileId: row.arrangement?.fileId, label: "Share this row’s PDF score" }, { kind: "audio", fileId: row.audioFileId, label: "Share this row’s source reference audio (MP3 only)" }]).filter(file => file.fileId).map(file => <label key={file.kind} className="flex items-start gap-3 text-sm">
                            <input type="checkbox" checked={files.includes(`${row.rowId}:${file.kind}`)} onChange={() => toggle(`${row.rowId}:${file.kind}`, files, setFiles)} disabled={busy} className="mt-1 h-4 w-4 accent-primary" />
                            <span>{file.label}</span>
                        </label>)}
                    </div>}
                </li>)}
            </ol>
            {files.length > 0 && <div className="flex flex-col gap-3">
                <Label className="leading-snug" htmlFor="rights">Permission or license covering these selected files for the assigned family</Label>
                <textarea id="rights" value={rights} onChange={event => setRights(event.target.value)} rows={3} maxLength={1000} disabled={busy} className="w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <p className="text-sm text-muted-foreground">Having a file in the music library does not establish permission to share it.</p>
            </div>}
            <div className="flex flex-wrap gap-3">
                <Button disabled={busy || source.reviewRequired || selected.length === 0 || (files.length > 0 && rights.trim().length < 12)} onClick={() => void save("approve")}>Approve selected sharing</Button>
                <Button variant="outline" disabled={busy} onClick={() => void save("revoke")}>Withdraw all sharing</Button>
            </div>
        </section>}
        <details className="border-t pt-5">
            <summary className="cursor-pointer text-sm text-muted-foreground">Advanced lookup</summary>
            <form className="mt-4 flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void inspect(ceremonyId) }}>
                <Label htmlFor="ceremony">Ceremony reference</Label>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Input id="ceremony" value={ceremonyId} onChange={event => { setCeremonyId(event.target.value); setSource(null) }} required disabled={busy} />
                    <Button variant="outline" disabled={busy || !ceremonyId} type="submit">Look up service</Button>
                </div>
            </form>
        </details>
    </main>
}
