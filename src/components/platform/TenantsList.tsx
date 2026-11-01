"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TenantSummary } from "@/lib/platform/tenants"
import { errorText, platformApi } from "./api"
import { ErrorLine, FEATURE_LABELS, StatusChip } from "./shared"
import { PlatformKeyCard } from "./PlatformKeyCard"

export function TenantsList() {
    const [tenants, setTenants] = useState<TenantSummary[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        platformApi.listTenants().then(setTenants, (e) => setError(errorText(e)))
    }, [])

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Tenants</h2>
                <Button asChild>
                    <Link href="/platform/new"><Plus className="w-4 h-4 mr-1.5" /> New tenant</Link>
                </Button>
            </div>
            <ErrorLine error={error} />
            {!tenants && !error && (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading tenants…</p>
            )}
            {tenants && tenants.length === 0 && <p className="text-sm text-muted-foreground">No tenants yet.</p>}
            {tenants && tenants.length > 0 && (
                <div className="border border-border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="px-4 py-2.5 font-medium">Name</th>
                                <th className="px-4 py-2.5 font-medium">Address</th>
                                <th className="px-4 py-2.5 font-medium">Status</th>
                                <th className="px-4 py-2.5 font-medium">Members</th>
                                <th className="px-4 py-2.5 font-medium">Features on</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map((t) => (
                                <tr key={t.orgId} className="border-t border-border hover:bg-accent/40 transition-colors">
                                    <td className="px-4 py-3">
                                        <Link href={`/platform/tenants/${encodeURIComponent(t.orgId)}`} className="font-medium text-foreground hover:text-brand hover:underline">
                                            {t.name}
                                        </Link>
                                        <div className="text-xs text-muted-foreground">{t.orgId}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {t.primaryAddress ? (
                                            <a href={`https://${t.primaryAddress}`} target="_blank" rel="noreferrer" className="text-brand hover:underline break-all">
                                                {t.primaryAddress}
                                            </a>
                                        ) : (
                                            <span className="text-muted-foreground">None</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusChip tone={t.status === "active" ? "good" : "bad"}>{t.status === "active" ? "Active" : "Suspended"}</StatusChip>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {t.memberCount}
                                        {t.pendingCount > 0 && <span className="text-caution dark:text-caution"> +{t.pendingCount} waiting</span>}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {t.featuresOn.length === 0 ? "None" : t.featuresOn.map((f) => FEATURE_LABELS[f]?.label ?? f).join(", ")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <PlatformKeyCard />
        </div>
    )
}
