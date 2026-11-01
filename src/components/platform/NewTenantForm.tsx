"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OrgConfigSchema, OrgIdSchema, type OrgConfigInput } from "@/lib/org/config-schema"
import type { CreateTenantInput, TenantSummary } from "@/lib/platform/tenants"
import { errorText, platformApi, type CreateResult } from "./api"
import { ErrorLine, PlatformCard, selectClass } from "./shared"

export interface NewTenantValues {
    orgId: string
    name: string
    shortName: string
    kind: "shul" | "band"
    language: "en" | "he"
    timeZone: string
    subdomain: string
    copyLiturgyFrom: string
}

// A neutral ink default (not a brand hue); the tenant sets its own colour later.
const DEFAULT_COLOUR = "#2B3445"

function initials(s: string): string {
    const w = s.trim().split(/\s+/).filter(Boolean)
    const out = (w.length > 1 ? w.map((x) => x[0]).join("") : s.trim().slice(0, 3)).toUpperCase().slice(0, 4)
    return out || "T"
}

/** The full tenant config from the few basics; everything else is editable on the tenant page afterwards. */
export function buildCreateInput(v: NewTenantValues): CreateTenantInput {
    const host = `${v.subdomain}.vercel.app`
    const shortName = v.shortName.trim() || v.name.trim()
    const config: Omit<OrgConfigInput, "id"> = {
        name: v.name.trim(),
        status: "active",
        domains: { primary: host, aliases: [] },
        branding: {
            shortName,
            abbreviation: initials(shortName),
            appName: v.name.trim(),
            metaTitleDefault: v.name.trim(),
            metaTitleTemplate: `%s | ${v.name.trim()}`,
            metaDescription: "",
            ogTitle: v.name.trim(),
            themeColor: DEFAULT_COLOUR,
            manifestPath: "/site.webmanifest",
            baseUrl: `https://${host}`,
        },
        vocabulary: { mode: v.kind },
        locale: { language: v.language, direction: v.language === "he" ? "rtl" : "ltr", timeZone: v.timeZone.trim() },
        email: { fromName: v.name.trim(), headerBg: DEFAULT_COLOUR, footerText: "" },
        legal: { operatorName: v.name.trim() },
        features: {},
        library: {},
        liturgy: {},
        congregationDefaults: { name: v.name.trim(), shortName, themeColor: DEFAULT_COLOUR },
    }
    return { orgId: v.orgId, config, subdomain: v.subdomain, ...(v.copyLiturgyFrom ? { copyLiturgyFrom: v.copyLiturgyFrom } : {}) }
}

/** Field → message; empty when the input is valid. */
export function validateNewTenant(v: NewTenantValues): Record<string, string> {
    const errors: Record<string, string> = {}
    const id = OrgIdSchema.safeParse(v.orgId)
    if (!id.success) errors.orgId = "Lowercase letters, digits and hyphens"
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(v.subdomain)) errors.subdomain = "Lowercase letters, digits and hyphens"
    if (!v.name.trim()) errors.name = "Required"
    if (!v.timeZone.trim()) errors.timeZone = "Required"
    else {
        try {
            new Intl.DateTimeFormat("en", { timeZone: v.timeZone.trim() })
        } catch {
            errors.timeZone = "Not a time zone, try America/Chicago"
        }
    }
    if (Object.keys(errors).length === 0) {
        const input = buildCreateInput(v)
        const r = OrgConfigSchema.safeParse({ id: v.orgId, ...input.config })
        if (!r.success) errors._form = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    }
    return errors
}

export function NewTenantForm() {
    const router = useRouter()
    const [tenants, setTenants] = useState<TenantSummary[]>([])
    const [v, setV] = useState<NewTenantValues>({
        orgId: "", name: "", shortName: "", kind: "shul", language: "en", timeZone: "America/Chicago", subdomain: "", copyLiturgyFrom: "",
    })
    const [subdomainTouched, setSubdomainTouched] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [preview, setPreview] = useState<CreateResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        platformApi.listTenants().then(setTenants, () => setTenants([]))
    }, [])

    const set = <K extends keyof NewTenantValues>(k: K, val: NewTenantValues[K]) => {
        setPreview(null)
        setV((cur) => {
            const next = { ...cur, [k]: val }
            if (k === "orgId" && !subdomainTouched) next.subdomain = String(val)
            return next
        })
    }

    const run = async (dryRun: boolean) => {
        const errs = validateNewTenant(v)
        setErrors(errs)
        if (Object.keys(errs).length > 0) return
        setBusy(true)
        setError(null)
        try {
            const r = await platformApi.createTenant(buildCreateInput(v), dryRun)
            if (dryRun) setPreview(r)
            else router.push(`/platform/tenants/${encodeURIComponent(v.orgId)}`)
        } catch (e) {
            setError(errorText(e))
        } finally {
            setBusy(false)
        }
    }

    const field = (k: keyof NewTenantValues, label: string, hint?: string, extra?: React.ReactNode) => (
        <div className="space-y-1.5">
            <Label htmlFor={`new-${k}`}>{label}</Label>
            {extra ?? (
                <Input
                    id={`new-${k}`}
                    value={v[k]}
                    aria-invalid={!!errors[k]}
                    onChange={(e) => {
                        if (k === "subdomain") setSubdomainTouched(true)
                        set(k, e.target.value as never)
                    }}
                />
            )}
            {errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    )

    return (
        <div className="space-y-6">
            <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> All tenants
            </Link>
            <PlatformCard title="New tenant" description="The basics. Everything else can be changed on the tenant's page afterwards.">
                <form
                    className="space-y-4"
                    onSubmit={(e) => { e.preventDefault(); void run(true) }}
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        {field("name", "Name", "For example Temple Beth Shalom")}
                        {field("shortName", "Short name", "Shown in the nav. Empty uses the name.")}
                        {field("orgId", "Tenant id", "Never changes. Lowercase letters, digits and hyphens.")}
                        {field("subdomain", "Default address", undefined, (
                            <div className="flex items-center gap-1 text-sm">
                                <Input
                                    id="new-subdomain"
                                    value={v.subdomain}
                                    aria-invalid={!!errors.subdomain}
                                    onChange={(e) => { setSubdomainTouched(true); set("subdomain", e.target.value) }}
                                />
                                <span className="text-muted-foreground">.vercel.app</span>
                            </div>
                        ))}
                        {field("kind", "Kind", undefined, (
                            <select id="new-kind" className={`${selectClass} w-full`} value={v.kind} onChange={(e) => set("kind", e.target.value as NewTenantValues["kind"])}>
                                <option value="shul">Synagogue</option>
                                <option value="band">Band</option>
                            </select>
                        ))}
                        {field("language", "Language", undefined, (
                            <select id="new-language" className={`${selectClass} w-full`} value={v.language} onChange={(e) => set("language", e.target.value as NewTenantValues["language"])}>
                                <option value="en">English</option>
                                <option value="he">Hebrew</option>
                            </select>
                        ))}
                        {field("timeZone", "Time zone", "For example America/Chicago or Asia/Jerusalem")}
                        {field("copyLiturgyFrom", "Copy liturgy frames and books from", undefined, (
                            <select id="new-copyLiturgyFrom" className={`${selectClass} w-full`} value={v.copyLiturgyFrom} onChange={(e) => set("copyLiturgyFrom", e.target.value)}>
                                <option value="">Don&apos;t copy</option>
                                {tenants.map((t) => <option key={t.orgId} value={t.orgId}>{t.name}</option>)}
                            </select>
                        ))}
                    </div>
                    <ErrorLine error={errors._form ?? null} />
                    <ErrorLine error={error} />
                    {!preview && (
                        <Button type="submit" disabled={busy}>
                            {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                            Preview
                        </Button>
                    )}
                </form>
                {preview && (
                    <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 space-y-3" data-testid="create-preview">
                        <p className="text-sm font-medium">Preview. Nothing is created until you press Create.</p>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                            <dt className="text-muted-foreground">Name</dt><dd>{preview.after?.name ?? v.name}</dd>
                            <dt className="text-muted-foreground">Tenant id</dt><dd><code>{v.orgId}</code></dd>
                            <dt className="text-muted-foreground">Address</dt><dd>{preview.address ?? `${v.subdomain}.vercel.app`}</dd>
                            {v.copyLiturgyFrom && (<><dt className="text-muted-foreground">Copies from</dt><dd>{tenants.find((t) => t.orgId === v.copyLiturgyFrom)?.name ?? v.copyLiturgyFrom}</dd></>)}
                        </dl>
                        {preview.nextSteps.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Then</p>
                                <ol className="list-decimal pl-5 text-sm space-y-0.5">
                                    {preview.nextSteps.map((s) => <li key={s}>{s}</li>)}
                                </ol>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button onClick={() => void run(false)} disabled={busy}>
                                {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                                Create {v.name.trim() || "tenant"}
                            </Button>
                            <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>Back to edit</Button>
                        </div>
                    </div>
                )}
            </PlatformCard>
        </div>
    )
}
