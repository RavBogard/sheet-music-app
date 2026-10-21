"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CollectionRecord, TenantDetail, TenantSummary } from "@/lib/platform/tenants"
import { errorText, platformApi } from "../api"
import { ConfirmDialog, DiffPreview, ErrorLine, PlatformCard, selectClass, StatusChip, useDryRun } from "../shared"

const VISIBILITY: Record<CollectionRecord["visibility"], string> = {
    private: "Only this tenant",
    listed: "Tenants I choose",
    all: "Every tenant",
}

function OwnedRow({ c, others, onSaved }: { c: CollectionRecord; others: TenantSummary[]; onSaved: () => void }) {
    const [visibility, setVisibility] = useState(c.visibility)
    const [sharedWith, setSharedWith] = useState<string[]>(c.sharedWith)
    const run = useDryRun<CollectionRecord>(onSaved)
    const dirty = visibility !== c.visibility || sharedWith.slice().sort().join() !== c.sharedWith.slice().sort().join()

    return (
        <li className="py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-sm font-medium">{c.label || c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.chartCount != null ? `${c.chartCount} charts` : c.id}</p>
                </div>
                <select
                    aria-label={`Who can see ${c.label || c.name}`}
                    className={selectClass}
                    value={visibility}
                    disabled={!!run.result}
                    onChange={(e) => setVisibility(e.target.value as CollectionRecord["visibility"])}
                >
                    {(Object.keys(VISIBILITY) as Array<CollectionRecord["visibility"]>).map((v) => (
                        <option key={v} value={v}>{VISIBILITY[v]}</option>
                    ))}
                </select>
            </div>
            {visibility === "listed" && (
                <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                    <legend className="sr-only">Shared with</legend>
                    {others.length === 0 && <span className="text-xs text-muted-foreground">No other tenants.</span>}
                    {others.map((t) => (
                        <label key={t.orgId} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-brand"
                                checked={sharedWith.includes(t.orgId)}
                                disabled={!!run.result}
                                onChange={(e) => setSharedWith((s) => (e.target.checked ? [...s, t.orgId] : s.filter((x) => x !== t.orgId)))}
                            />
                            {t.name}
                        </label>
                    ))}
                </fieldset>
            )}
            <ErrorLine error={run.error} />
            {run.result ? (
                <DiffPreview result={run.result} busy={run.busy} onApply={() => void run.apply()} onCancel={run.cancel} />
            ) : (
                dirty && (
                    <Button
                        size="sm"
                        disabled={run.busy}
                        onClick={() => void run.preview((dry) =>
                            platformApi.setCollectionSharing(c.id, { visibility, sharedWith: visibility === "listed" ? sharedWith : [] }, dry))}
                    >
                        Save sharing
                    </Button>
                )
            )}
        </li>
    )
}

export function CollectionsSection({ detail }: { detail: TenantDetail }) {
    const orgId = detail.summary.orgId
    const tenantName = detail.summary.name
    const [all, setAll] = useState<CollectionRecord[] | null>(null)
    const [tenants, setTenants] = useState<TenantSummary[]>([])
    const [error, setError] = useState<string | null>(null)
    const [unassign, setUnassign] = useState<CollectionRecord | null>(null)

    const load = useCallback(async () => {
        setError(null)
        try {
            const [c, t] = await Promise.all([platformApi.listCollections(), platformApi.listTenants()])
            setAll(c)
            setTenants(t)
        } catch (e) {
            setError(errorText(e))
            setAll((cur) => cur ?? [])
        }
    }, [])

    const assignRun = useDryRun<CollectionRecord>(() => void load())

    useEffect(() => { void load() }, [load])

    const owned = (all ?? []).filter((c) => c.ownerOrgId === orgId)
    const shared = (all ?? []).filter(
        (c) => c.ownerOrgId !== orgId && (c.visibility === "all" || c.sharedWith.includes(orgId) || c.assignedTo.includes(orgId)),
    )
    const others = tenants.filter((t) => t.orgId !== orgId)
    const ownerName = (id: string) => tenants.find((t) => t.orgId === id)?.name ?? id

    return (
        <PlatformCard id="collections" title="Collections" description="Chart collections this tenant owns, and ones other tenants share with it.">
            {all === null ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading collections…</p>
            ) : (
                <>
                    <ErrorLine error={error} />
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owned</p>
                        {owned.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">None.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {owned.map((c) => <OwnedRow key={`${c.id}:${c.visibility}:${c.sharedWith.join()}`} c={c} others={others} onSaved={() => void load()} />)}
                            </ul>
                        )}
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shared with this tenant</p>
                        {shared.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">None.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {shared.map((c) => {
                                    const assigned = c.assignedTo.includes(orgId)
                                    return (
                                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                                            <div>
                                                <p className="text-sm font-medium">{c.label || c.name}</p>
                                                <p className="text-xs text-muted-foreground">From {ownerName(c.ownerOrgId)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {assigned && <StatusChip tone="good">Assigned</StatusChip>}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={assignRun.busy || !!assignRun.result}
                                                    onClick={() => (assigned
                                                        ? setUnassign(c)
                                                        : void assignRun.preview((dry) => platformApi.assignCollection(c.id, orgId, true, dry)))}
                                                >
                                                    {assigned ? "Unassign" : "Assign"}
                                                </Button>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                    <ErrorLine error={assignRun.error} />
                    {assignRun.result && (
                        <DiffPreview result={assignRun.result} busy={assignRun.busy} onApply={() => void assignRun.apply()} onCancel={assignRun.cancel} />
                    )}
                </>
            )}
            <ConfirmDialog
                open={unassign !== null}
                onOpenChange={(o) => !o && setUnassign(null)}
                title={`Unassign ${unassign?.label || unassign?.name || ""} from ${tenantName}?`}
                description={`${tenantName} keeps seeing it only if its owner still shares it. Setlists that already use its charts keep working.`}
                confirmLabel="Unassign"
                onConfirm={() => {
                    const c = unassign
                    setUnassign(null)
                    if (c) void assignRun.preview((dry) => platformApi.assignCollection(c.id, orgId, false, dry))
                }}
            />
        </PlatformCard>
    )
}
