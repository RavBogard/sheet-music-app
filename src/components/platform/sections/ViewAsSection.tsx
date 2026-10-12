"use client"

import { useState } from "react"
import { ExternalLink, KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TenantDetail } from "@/lib/platform/tenants"
import { errorText, platformApi } from "../api"
import { CopyButton, ErrorLine, PlatformCard, selectClass } from "../shared"

export function ViewAsSection({ detail }: { detail: TenantDetail }) {
    const orgId = detail.summary.orgId
    const primary = detail.summary.primaryAddress
    const [minutes, setMinutes] = useState(30)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [bearer, setBearer] = useState<{ token: string; expiresAt: string } | null>(null)

    const mint = async () => {
        setBusy(true)
        setError(null)
        try {
            const r = await platformApi.viewBearer(orgId, minutes)
            setBearer({ token: r.token, expiresAt: r.expiresAt })
        } catch (e) {
            setError(errorText(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <PlatformCard
            id="view-as"
            title="View as this tenant"
            description="Opens the tenant's address in a new tab. You are signed in there as yourself, and viewing is read-only."
        >
            <div className="flex flex-wrap gap-2">
                {primary ? (
                    <Button asChild variant="outline">
                        <a href={`https://${primary}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-4 h-4 mr-1.5" /> Open {primary}
                        </a>
                    </Button>
                ) : (
                    <p className="text-sm text-muted-foreground">Set up an address first.</p>
                )}
            </div>
            <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                    For Claude: a short-lived, read-only key for this tenant&apos;s connector. It is shown once.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Key lasts" className={selectClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                        <option value={15}>15 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={60}>60 minutes</option>
                    </select>
                    <Button variant="outline" onClick={() => void mint()} disabled={busy}>
                        {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1.5" />}
                        Make view key
                    </Button>
                </div>
                <ErrorLine error={error} />
                {bearer && (
                    <div className="rounded-lg border border-border p-3 space-y-2">
                        <p className="text-sm">Copy it now. It will not be shown again. Expires {new Date(bearer.expiresAt).toLocaleTimeString()}.</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs break-all bg-muted/50 rounded px-2 py-1" data-testid="view-bearer">{bearer.token}</code>
                            <CopyButton text={bearer.token} label="Copy key" />
                            <Button size="sm" variant="ghost" onClick={() => setBearer(null)}>Hide</Button>
                        </div>
                    </div>
                )}
            </div>
        </PlatformCard>
    )
}
