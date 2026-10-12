"use client"

import { Fragment, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PlatformAuditEntry, TenantSummary } from "@/lib/platform/tenants"
import { errorText, platformApi } from "./api"
import { ErrorLine, selectClass } from "./shared"

const LIMIT = 100

export function ActivityLog() {
    const [tenants, setTenants] = useState<TenantSummary[]>([])
    const [orgId, setOrgId] = useState("")
    const [rows, setRows] = useState<PlatformAuditEntry[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [open, setOpen] = useState<string | null>(null)

    useEffect(() => {
        platformApi.listTenants().then(setTenants, () => setTenants([]))
    }, [])

    useEffect(() => {
        let cancelled = false
        setRows(null)
        setError(null)
        platformApi.activity({ orgId: orgId || undefined, limit: LIMIT }).then(
            (r) => { if (!cancelled) setRows(r) },
            (e) => { if (!cancelled) { setError(errorText(e)); setRows([]) } },
        )
        return () => { cancelled = true }
    }, [orgId])

    const name = (id: string | null) => (id ? tenants.find((t) => t.orgId === id)?.name ?? id : "Platform")

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Activity</h2>
                <select aria-label="Tenant" className={selectClass} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                    <option value="">All tenants</option>
                    {tenants.map((t) => <option key={t.orgId} value={t.orgId}>{t.name}</option>)}
                </select>
            </div>
            <ErrorLine error={error} />
            {rows === null ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading activity…</p>
            ) : rows.length === 0 ? (
                !error && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
                <div className="border border-border rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="px-4 py-2.5 font-medium">When</th>
                                <th className="px-4 py-2.5 font-medium">Tenant</th>
                                <th className="px-4 py-2.5 font-medium">Action</th>
                                <th className="px-4 py-2.5 font-medium">Who</th>
                                <th className="px-4 py-2.5 font-medium">From</th>
                                <th className="px-4 py-2.5"><span className="sr-only">Details</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <Fragment key={r.id}>
                                    <tr className="border-t border-border">
                                        <td className="px-4 py-2.5 whitespace-nowrap">{new Date(r.at).toLocaleString()}</td>
                                        <td className="px-4 py-2.5">{name(r.orgId)}</td>
                                        <td className="px-4 py-2.5 font-mono text-xs">{r.action}</td>
                                        <td className="px-4 py-2.5 break-all">{r.actorEmail ?? r.actorUid}</td>
                                        <td className="px-4 py-2.5">{r.via === "claude" ? "Claude" : "Console"}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <Button size="sm" variant="ghost" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                                                {open === r.id ? "Hide" : "Details"}
                                            </Button>
                                        </td>
                                    </tr>
                                    {open === r.id && (
                                        <tr className="bg-muted/30">
                                            <td colSpan={6} className="px-4 py-3">
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground mb-1">Before</p>
                                                        <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(r.before, null, 2) ?? "(none)"}</pre>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-muted-foreground mb-1">After</p>
                                                        <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(r.after, null, 2) ?? "(none)"}</pre>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
