"use client"

import { useState } from "react"
import { ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TenantDetail } from "@/lib/platform/tenants"
import type { CustomDomainStatus, DnsRecord } from "@/lib/platform/tenant-address"
import { errorText, platformApi } from "../api"
import { ConfirmDialog, CopyButton, ErrorLine, PlatformCard, StatusChip } from "../shared"

interface DomainView {
    apex: string
    www: string
    status: CustomDomainStatus
    records: DnsRecord[]
    instructions?: string
}

const STATUS_WORDS: Record<CustomDomainStatus, { text: string; tone: "warn" | "neutral" | "good" }> = {
    waiting_for_dns: { text: "Waiting for DNS", tone: "warn" },
    verified: { text: "Verified, certificate pending", tone: "neutral" },
    live: { text: "Live", tone: "good" },
}

function readDomains(raw: Record<string, unknown>): Record<string, DomainView> {
    const out: Record<string, DomainView> = {}
    for (const [apex, v] of Object.entries(raw ?? {})) {
        const e = v as Partial<DomainView>
        if (!e || typeof e !== "object" || !e.status) continue
        out[apex] = { apex, www: e.www ?? `www.${apex}`, status: e.status, records: e.records ?? [], instructions: e.instructions }
    }
    return out
}

export function AddressesSection({ detail, onChanged }: { detail: TenantDetail; onChanged: () => void }) {
    const orgId = detail.summary.orgId
    const name = detail.summary.name
    const primary = detail.summary.primaryAddress
    const [domains, setDomains] = useState(() => readDomains(detail.domainStatus))
    const [slug, setSlug] = useState(orgId)
    const [newDomain, setNewDomain] = useState("")
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [removing, setRemoving] = useState<string | null>(null)

    const act = async (key: string, fn: () => Promise<void>) => {
        setBusy(key)
        setError(null)
        try {
            await fn()
        } catch (e) {
            setError(errorText(e))
        } finally {
            setBusy(null)
        }
    }

    const keep = (r: DomainView) => setDomains((d) => ({ ...d, [r.apex]: r }))

    return (
        <PlatformCard id="addresses" title="Addresses" description="Where people open this tenant's app.">
            <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Main address</p>
                {primary ? (
                    <a href={`https://${primary}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
                        {primary} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                ) : (
                    <p className="text-sm text-muted-foreground">No address yet.</p>
                )}
                {detail.summary.addresses.filter((a) => a !== primary).length > 0 && (
                    <p className="text-xs text-muted-foreground">Also: {detail.summary.addresses.filter((a) => a !== primary).join(", ")}</p>
                )}
            </div>

            {!detail.summary.addresses.some((a) => a.endsWith(".vercel.app")) && (
                <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void act("provision", async () => {
                            await platformApi.provisionAddress(orgId, slug.trim())
                            onChanged()
                        })
                    }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="default-address">Default address</Label>
                        <div className="flex items-center gap-1 text-sm">
                            <Input id="default-address" className="w-48" value={slug} onChange={(e) => setSlug(e.target.value)} />
                            <span className="text-muted-foreground">.vercel.app</span>
                        </div>
                    </div>
                    <Button type="submit" disabled={busy !== null || slug.trim().length < 2}>
                        {busy === "provision" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                        Set up default address
                    </Button>
                </form>
            )}

            <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom domains</p>
                {Object.values(domains).length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
                {Object.values(domains).map((d) => (
                    <div key={d.apex} className="rounded-lg border border-border p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{d.www}</span>
                                <StatusChip tone={STATUS_WORDS[d.status].tone}>{STATUS_WORDS[d.status].text}</StatusChip>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy !== null}
                                    onClick={() => void act(`check:${d.apex}`, async () => {
                                        const r = await platformApi.checkDomain(orgId, d.apex)
                                        keep(r)
                                        if (r.status === "live") onChanged()
                                    })}
                                >
                                    {busy === `check:${d.apex}` ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                                    Check again
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => setRemoving(d.apex)}>
                                    Remove
                                </Button>
                            </div>
                        </div>
                        {d.status !== "live" && d.records.length > 0 && (
                            <>
                                <p className="text-sm text-muted-foreground">Give these records to whoever manages the domain:</p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs text-muted-foreground">
                                                <th className="py-1 pr-3 font-medium">Type</th>
                                                <th className="py-1 pr-3 font-medium">Host</th>
                                                <th className="py-1 pr-3 font-medium">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {d.records.map((r) => (
                                                <tr key={`${r.type}-${r.host}-${r.value}`} className="border-t border-border">
                                                    <td className="py-1.5 pr-3 font-mono">{r.type}</td>
                                                    <td className="py-1.5 pr-3 font-mono">{r.host}</td>
                                                    <td className="py-1.5 pr-3 font-mono break-all">{r.value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {d.instructions && (
                                    <div className="space-y-2">
                                        <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 font-sans">{d.instructions}</pre>
                                        <CopyButton text={d.instructions} label="Copy steps" />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ))}

                <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void act("add", async () => {
                            const r = await platformApi.addDomain(orgId, newDomain.trim())
                            keep(r)
                            setNewDomain("")
                        })
                    }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="custom-domain">Add custom domain</Label>
                        <Input id="custom-domain" className="w-64" placeholder="example.org" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
                    </div>
                    <Button type="submit" variant="outline" disabled={busy !== null || newDomain.trim().length < 3}>
                        {busy === "add" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                        Add domain
                    </Button>
                </form>
            </div>
            <ErrorLine error={error} />
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(o) => !o && setRemoving(null)}
                title={`Remove ${removing ?? ""} from ${name}?`}
                description={`${removing ?? ""} and its www address will stop opening ${name}. The DNS records at the registrar are not touched.`}
                confirmLabel="Remove domain"
                onConfirm={() => {
                    const apex = removing
                    setRemoving(null)
                    if (!apex) return
                    void act(`remove:${apex}`, async () => {
                        await platformApi.removeDomain(orgId, apex)
                        setDomains((d) => {
                            const n = { ...d }
                            delete n[apex]
                            return n
                        })
                        onChanged()
                    })
                }}
            />
        </PlatformCard>
    )
}
